export interface PortEntry {
  id: string;
  port: number;
  transport: string;
  service: string;
  description: string;
  security: string;
  source: string;
}
export interface ProtocolEntry {
  id: string;
  name: string;
  layer: string;
  description: string;
  uses: string;
  source: string;
}
export interface OuiEntry {
  prefix: string;
  vendor: string;
  source: string;
}
export interface TemplateSegment {
  name: string;
  hosts: number;
  growthPercent?: number;
  vlan?: number;
  gateway?: string;
  purpose?: string;
  cidr?: string;
  ipv6?: string;
}
export interface NetworkTemplate {
  id: string;
  name: string;
  description: string;
  network: string;
  policy?: string;
  segments: TemplateSegment[];
  notes: string[];
}
export interface ThreatEntry {
  id: string;
  name: string;
  description: string;
  indicators: string[];
  defenses: string[];
  source: string;
}
export interface CommandEntry {
  id: string;
  name: string;
  platform: string;
  purpose: string;
  syntax: string;
  example: string;
  caution: string;
  source: string;
}
export interface CvssCard {
  id: string;
  title: string;
  description: string;
  example?: string;
  source: string;
}
