import { Heart, Lungs, Bolt, Chart, Thermometer, Droplet, Shield } from '../lib/icons';

/** One icon per metric, so a tile reads at a glance without its label. */
export const METRIC_ICON = {
  hr: Heart,
  spo2: Lungs,
  rr: Bolt,
  bp: Chart,
  temp: Thermometer,
  glucose: Droplet,
};

export const iconFor = (metric) => METRIC_ICON[metric] ?? Shield;
