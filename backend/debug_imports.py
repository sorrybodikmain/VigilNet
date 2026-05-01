import sys
sys.stdout.write("step1: basic imports\n"); sys.stdout.flush()
import asyncio, json, logging, os, threading, time
sys.stdout.write("step2: cv2\n"); sys.stdout.flush()
import cv2
sys.stdout.write("step3: fastapi\n"); sys.stdout.flush()
from fastapi import FastAPI
sys.stdout.write("step4: uvicorn\n"); sys.stdout.flush()
import uvicorn
sys.stdout.write("step5: config_loader\n"); sys.stdout.flush()
from config_loader import load
sys.stdout.write("step6: env_config\n"); sys.stdout.flush()
from env_config import config_from_env
sys.stdout.write("step7: camera_stream\n"); sys.stdout.flush()
from camera_stream import StreamManager
sys.stdout.write("step8: detector\n"); sys.stdout.flush()
from detector import PersonDetector
sys.stdout.write("step9: cross_tracker\n"); sys.stdout.flush()
from cross_tracker import CrossCameraTracker
sys.stdout.write("step10: ptz_controller\n"); sys.stdout.flush()
from ptz_controller import PTZController
sys.stdout.write("ALL_IMPORTS_OK\n"); sys.stdout.flush()
