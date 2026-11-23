"""Device JSON configuration round-trips without a database or service."""
import importlib
from pathlib import Path
import sys
import types
import unittest

APP=Path(__file__).resolve().parents[1]/'app'
if 'models' not in sys.modules:
    package=types.ModuleType('models');package.__path__=[str(APP/'models')];sys.modules['models']=package
from models.schemas import DeviceCreate

class SensorLabelTests(unittest.TestCase):
    def test_config_round_trip_preserves_labels_source_and_other_settings(self):
        device=DeviceCreate(imei='1234567890',name='Demo',protocol='h02',config={
            'sensors':{'battery_level':'h02_io8','temperature':'temp'},
            'sensor_labels':{'h02_io8':'Internal battery','h02_io1':'Network country'},
            'offline_timeout_hours':12,'has_camera':True})
        again=DeviceCreate.model_validate(device.model_dump())
        self.assertEqual(again.config.sensor_labels['h02_io8'],'Internal battery')
        self.assertEqual(again.config.sensors['battery_level'],'h02_io8')
        self.assertEqual(again.config.sensors['temperature'],'temp')
        self.assertEqual(again.config.offline_timeout_hours,12)
        self.assertTrue(again.config.has_camera)

    def test_old_device_configuration_remains_valid(self):
        device=DeviceCreate(imei='1234567890',name='Demo',config={})
        self.assertEqual(device.config.sensor_labels,{})

if __name__=='__main__': unittest.main()
