"""Pure decoder tests: real schema/registry, no server, DB, devices or commands."""
import importlib
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch
from datetime import datetime, timezone

APP = Path(__file__).resolve().parents[1] / 'app'
# Avoid ORM initialization and discovery of unrelated protocols. The schema,
# decoder, base class and registry below are the real application modules.
models = types.ModuleType('models')
models.__path__ = [str(APP / 'models')]
sys.modules['models'] = models
sys.path.insert(0, str(APP))
with patch('pkgutil.iter_modules', return_value=[]):
    import protocols
from protocols.h02 import H02Decoder
from models.schemas import NormalizedPosition

CORE = '1234567890,{kind},202252,A,3800.0000,N,00900.0000,W,2.0,128,231126,FFFFFBFF'
TAIL = ',001,01,101,202,11,17,40,97'

def frame(kind='V8', tail=TAIL):
    return ('*HQ,' + CORE.format(kind=kind) + tail + '#').encode()

class H02V8Tests(unittest.IsolatedAsyncioTestCase):
    async def decode(self, packet):
        return await H02Decoder().decode(packet, {'ip': '127.0.0.1'})

    async def test_v8_position_and_opaque_extensions(self):
        packet = frame()
        p, consumed = await self.decode(packet)
        self.assertIsInstance(p, NormalizedPosition)
        self.assertEqual(consumed, len(packet))
        self.assertEqual(p.imei, '1234567890')
        self.assertEqual(p.protocol, 'h02')
        self.assertEqual(p.device_time, datetime(2026,11,23,20,22,52,tzinfo=timezone.utc))
        self.assertAlmostEqual(p.latitude,38.0)
        self.assertAlmostEqual(p.longitude,-9.0)
        self.assertAlmostEqual(p.speed,3.704)
        self.assertEqual(p.course,128)
        self.assertEqual(p.raw_data['message_type'],'V8')
        self.assertEqual(p.sensors['h02_io1'],'001')
        self.assertEqual(p.sensors['h02_io2'],'01')
        self.assertEqual(p.sensors['h02_io8'],'97')
        for field in ['battery_voltage','battery_level','gsm_signal','io_status']:
            self.assertNotIn(field,p.sensors)
        self.assertEqual(p.altitude,0.0)

    async def test_unpadded_longitude_under_one_degree(self):
        packet = frame().replace(b'00900.0000,W',b'9.9068,W')
        p, _ = await self.decode(packet)
        self.assertAlmostEqual(p.longitude, -9.9068/60)

    async def test_hemispheres_and_zero_degrees(self):
        packet = frame().replace(b'3800.0000,N',b'0012.0000,S').replace(b'00900.0000,W',b'00000.0000,E')
        p, _ = await self.decode(packet)
        self.assertAlmostEqual(p.latitude,-0.2)
        self.assertEqual(p.longitude,0)

    async def test_fragment_waits_then_decodes_once(self):
        packet=frame()
        self.assertEqual(await self.decode(packet[:30]),(None,0))
        p, consumed=await self.decode(packet[:30]+packet[30:])
        self.assertIsInstance(p,NormalizedPosition)
        self.assertEqual(consumed,len(packet))

    async def test_coalesced_frames_consume_one_at_a_time(self):
        a=frame();b=frame().replace(b'202252',b'202253')
        p, consumed=await self.decode(a+b)
        self.assertEqual(consumed,len(a))
        q, rest=await self.decode((a+b)[consumed:])
        self.assertEqual(rest,len(b))
        self.assertEqual((q.device_time-p.device_time).total_seconds(),1)

    async def test_v1_v4_sensor_layout_stays_compatible(self):
        for kind in ['V1','V4']:
            with self.subTest(kind=kind):
                p, _=await self.decode(frame(kind,',0A,3.7,22,15'))
                self.assertEqual(p.sensors['io_status'],10)
                self.assertEqual(p.sensors['battery_voltage'],3.7)
                self.assertEqual(p.sensors['gsm_signal'],22)
                self.assertEqual(p.altitude,15)
                self.assertNotIn('h02_io1',p.sensors)

    async def test_v8_empty_or_short_tail(self):
        for tail in ['',',001',' ,001,,']:
            p, _=await self.decode(frame(tail=tail))
            self.assertIsInstance(p,NormalizedPosition)
            self.assertNotIn('battery_voltage',p.sensors)

    async def test_invalid_v8_is_consumed_without_position(self):
        cases=[frame().replace(b'3800.0000',b'3860.0000'),
               frame().replace(b'00900.0000',b'18100.0000'),
               frame().replace(b'202252',b'252252'),
               frame().replace(b'231126',b'321126'),
               frame().replace(b',128,',b',999,'),
               b'*HQ,1234567890,V8,202252,A#']
        for packet in cases:
            with self.subTest(packet=packet):
                self.assertEqual(await self.decode(packet),(None,len(packet)))

    async def test_existing_heartbeat_and_link(self):
        p, _=await self.decode(b'*HQ,1234567890,HTBT,3.7#')
        self.assertEqual(p['sensors']['battery_voltage'],3.7)
        self.assertIn(b'R12',p['response'])
        p, _=await self.decode(b'*HQ,1234567890,LINK,202252,11,17,97,0,0,231126#')
        self.assertEqual(p['sensors']['battery_pct'],97)

if __name__=='__main__':
    unittest.main()
