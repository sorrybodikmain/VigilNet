import os
import struct
import json
import hashlib
import asyncio
from datetime import datetime
from re import compile
import time
import logging


class SomethingIsWrongWithCamera(Exception):
    pass


class DVRIPCam(object):
    DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
    CODES = {
        100: "OK",
        101: "Unknown error",
        102: "Unsupported version",
        103: "Request not permitted",
        104: "User already logged in",
        105: "User is not logged in",
        106: "Username or password is incorrect",
        107: "User does not have necessary permissions",
        203: "Password is incorrect",
        511: "Start of upgrade",
        512: "Upgrade was not started",
        513: "Upgrade data errors",
        514: "Upgrade error",
        515: "Upgrade successful",
    }
    QCODES = {
        "AuthorityList":      1470,
        "Users":              1472,
        "Groups":             1474,
        "AddGroup":           1476,
        "ModifyGroup":        1478,
        "DelGroup":           1480,
        "AddUser":            1482,
        "ModifyUser":         1484,
        "DelUser":            1486,
        "ModifyPassword":     1488,
        "AlarmInfo":          1504,
        "AlarmSet":           1500,
        "ChannelTitle":       1046,
        "EncodeCapability":   1360,
        "General":            1042,
        "KeepAlive":          1006,
        "OPMachine":          1450,
        "OPMailTest":         1636,
        "OPMonitor":          1413,
        "OPNetKeyboard":      1550,
        "OPPTZControl":       1400,
        "OPSNAP":             1560,
        "OPSendFile":         0x5F2,
        "OPSystemUpgrade":    0x5F5,
        "OPTalk":             1434,
        "OPTimeQuery":        1452,
        "OPTimeSetting":      1450,
        "NetWork.NetCommon":  1042,
        "OPNetAlarm":         1506,
        "SystemFunction":     1360,
        "SystemInfo":         1020,
    }
    OK_CODES = [100, 515]
    PORTS = {
        "tcp": 34567,
        "udp": 34568,
    }

    def __init__(self, ip, **kwargs):
        self.logger   = logging.getLogger(__name__)
        self.ip       = ip
        self.user     = kwargs.get("user", "admin")
        self.hash_pass = kwargs.get(
            "hash_pass",
            self.sofia_hash(kwargs.get("password", ""))
        )
        self.proto  = kwargs.get("proto", "tcp")
        self.port   = kwargs.get("port", self.PORTS.get(self.proto))
        self.socket_reader = None
        self.socket_writer = None
        self.packet_count  = 0
        self.session       = 0
        self.alive_time    = 20
        self.alarm_func    = None
        self.timeout       = 10
        self.busy          = asyncio.Lock()

    async def connect(self, timeout=10):
        try:
            self.socket_reader, self.socket_writer = await asyncio.wait_for(
                asyncio.open_connection(self.ip, self.port), timeout=timeout
            )
            self.socket_send = self.tcp_socket_send
            self.socket_recv = self.tcp_socket_recv
            self.timeout = timeout
        except OSError:
            raise SomethingIsWrongWithCamera("Cannot connect to camera")

    def close(self):
        try:
            self.socket_writer.close()
        except Exception:
            pass
        self.socket_writer = None

    def tcp_socket_send(self, data):
        try:
            return self.socket_writer.write(data)
        except Exception:
            return None

    async def tcp_socket_recv(self, bufsize):
        try:
            return await self.socket_reader.read(bufsize)
        except Exception:
            return None

    async def receive_with_timeout(self, length):
        received = 0
        buf = bytearray()
        start_time = time.time()
        while True:
            try:
                data = await asyncio.wait_for(
                    self.socket_recv(length - received), timeout=self.timeout
                )
                buf.extend(data)
                received += len(data)
                if length == received:
                    break
                if time.time() - start_time > self.timeout:
                    return None
            except asyncio.TimeoutError:
                return None
        return buf

    async def receive_json(self, length):
        data = await self.receive_with_timeout(length)
        if data is None:
            return {}
        self.packet_count += 1
        self.logger.debug("<= %s", data)
        reply = json.loads(data[:-2])
        return reply

    async def send(self, msg, data={}, wait_response=True):
        if self.socket_writer is None:
            return {"Ret": 101}
        await self.busy.acquire()
        if hasattr(data, "__iter__"):
            data = bytes(json.dumps(data, ensure_ascii=False), "utf-8")
        pkt = (
            struct.pack(
                "BB2xII2xHI",
                255, 0, self.session, self.packet_count, msg, len(data) + 2,
            )
            + data
            + b"\x0a\x00"
        )
        self.logger.debug("=> %s", pkt)
        self.socket_send(pkt)
        if wait_response:
            reply = {"Ret": 101}
            raw = await self.socket_recv(20)
            if raw is None or len(raw) < 20:
                self.busy.release()
                return None
            (head, version, self.session, sequence_number, msgid, len_data) = struct.unpack(
                "BB2xII2xHI", raw
            )
            reply = await self.receive_json(len_data)
            self.busy.release()
            return reply
        self.busy.release()
        return None

    def sofia_hash(self, password=""):
        md5   = hashlib.md5(bytes(password, "utf-8")).digest()
        chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
        return "".join([chars[sum(x) % 62] for x in zip(md5[::2], md5[1::2])])

    async def login(self, loop=None):
        if self.socket_writer is None:
            await self.connect()
        data = await self.send(
            1000,
            {
                "EncryptType": "MD5",
                "LoginType":   "DVRIP-Web",
                "PassWord":    self.hash_pass,
                "UserName":    self.user,
            },
        )
        if data is None or data.get("Ret") not in self.OK_CODES:
            return False
        self.session    = int(data["SessionID"], 16)
        self.alive_time = data.get("AliveInterval", 20)
        if loop:
            loop.create_task(self.keep_alive_worker())
        return True

    async def keep_alive_worker(self):
        while self.socket_writer:
            ret = await self.send(
                self.QCODES["KeepAlive"],
                {"Name": "KeepAlive", "SessionID": "0x%08X" % self.session},
            )
            if ret is None:
                self.close()
                break
            await asyncio.sleep(self.alive_time)

    async def ptz(self, cmd, step=5, preset=-1, ch=0):
        ptz_param = {
            "AUX":      {"Number": 0, "Status": "On"},
            "Channel":  ch,
            "MenuOpts": "Enter",
            "Pattern":  "Start",
            "Preset":   preset,
            "Step":     step,
            "Tour":     1 if "Tour" in cmd else 0,
        }
        return await self.set_command(
            "OPPTZControl", {"Command": cmd, "Parameter": ptz_param}
        )

    async def get_system_capabilities(self):
        return await self.get_command("SystemFunction")

    async def get_system_info(self):
        return await self.get_command("SystemInfo")

    async def set_command(self, command, data, code=None):
        if not code:
            code = self.QCODES[command]
        return await self.send(
            code,
            {"Name": command, "SessionID": "0x%08X" % self.session, command: data},
        )

    async def get_command(self, command, code=None):
        if not code:
            code = self.QCODES[command]
        data = await self.send(
            code, {"Name": command, "SessionID": "0x%08X" % self.session}
        )
        if data and data.get("Ret") in self.OK_CODES and command in data:
            return data[command]
        return data
