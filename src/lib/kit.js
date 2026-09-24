import { stableUuid } from './util'

export const KIT_CATEGORIES = [
  { key: 'lens', label: 'Lentes', short: 'Lente' },
  { key: 'filter', label: 'Filtros', short: 'Filtros' },
  { key: 'tstop', label: 'T-Stop', short: 'T-Stop' },
  { key: 'focus', label: 'Foco', short: 'Foco' },
  { key: 'iso', label: 'ISO / EI', short: 'ISO' },
  { key: 'shutter', label: 'Shutter', short: 'Shutter' },
  { key: 'fps', label: 'FPS', short: 'FPS' },
  { key: 'wb', label: 'WB', short: 'WB' },
  { key: 'camera', label: 'Câmeras', short: 'Cam' },
]

export const catLabel = (k) => KIT_CATEGORIES.find((c) => c.key === k)?.label || k

export const DEFAULT_KIT = {
  lens: ['18mm', '25mm', '32mm', '40mm', '50mm', '65mm', '75mm', '100mm', '135mm', '24-70mm', '70-200mm'],
  filter: ['ND .3', 'ND .6', 'ND .9', 'ND 1.2', 'ND 1.5', 'ND 1.8', 'ND 2.1', 'Pro-Mist 1/8', 'Pro-Mist 1/4',
    'Pro-Mist 1/2', 'Pola', 'IRND .6', 'IRND .9'],
  tstop: ['T1.3', 'T1.5', 'T1.8', 'T2', 'T2.2', 'T2.5', 'T2.8', 'T3.2', 'T3.5', 'T4', 'T4.5', 'T5.6', 'T6.3', 'T8',
    'T11', 'T16', 'T22'],
  focus: ['0,45m', '0,6m', '0,8m', '1m', '1,2m', '1,5m', '1,8m', '2m', '2,5m', '3m', '4m', '5m', '7m', '10m', '∞'],
  iso: ['160', '200', '400', '640', '800', '1280', '1600', '3200'],
  shutter: ['180°', '172.8°', '144°', '90°', '45°', '1/48', '1/50', '1/60', '1/100', '1/120'],
  fps: ['23.976', '24', '25', '29.97', '30', '48', '50', '60', '100', '120'],
  wb: ['3200K', '4300K', '5000K', '5600K', '6500K'],
  camera: ['A', 'B', 'C'],
}

export const kitItemId = (userId, category, value) => stableUuid(`${userId}|${category}|${value.trim().toLowerCase()}`)
