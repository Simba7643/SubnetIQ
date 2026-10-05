insert into public.network_templates (id, name, description, category, plan)
values
(
  'home-segmented',
  'Home with guest and device isolation',
  'An editable home example with trusted devices, guests, IoT, management, and growth space. Documentation IPv6 prefixes require replacement with a delegated prefix.',
  'home',
  '{"schemaVersion":1,"parent":"192.168.50.0/24","ipv6Parent":"2001:db8:50::/56","addressSpace":"home","networks":[{"name":"Trusted","cidr":"192.168.50.0/26","ipv6":"2001:db8:50:10::/64","vlanId":10,"gateway":"192.168.50.1","purpose":"Personal computers and phones","notes":"Allow internet and selected local services."},{"name":"Guest","cidr":"192.168.50.64/26","ipv6":"2001:db8:50:20::/64","vlanId":20,"gateway":"192.168.50.65","purpose":"Visitor devices","notes":"Deny access to internal address spaces and permit required internet services."},{"name":"IoT","cidr":"192.168.50.128/27","ipv6":"2001:db8:50:30::/64","vlanId":30,"gateway":"192.168.50.129","purpose":"Appliances and sensors","notes":"Permit only required DNS, NTP, controller, and vendor destinations."},{"name":"Management","cidr":"192.168.50.160/27","ipv6":"2001:db8:50:40::/64","vlanId":40,"gateway":"192.168.50.161","purpose":"Network device management","notes":"Limit administration to authorized devices."}],"reserved":["192.168.50.192/26"],"notes":"IPv4 LAN policy. Each populated IPv6 segment is a /64. Review DNS, DHCP, firewall, and Wi-Fi mappings for the actual equipment."}'::jsonb
),
(
  'smb-office',
  'Small business with a server segment',
  'A small-office address plan separating staff, voice, servers, guests, and management with reserved growth capacity.',
  'smb',
  '{"schemaVersion":1,"parent":"10.20.0.0/16","ipv6Parent":"2001:db8:20::/48","addressSpace":"main-office","networks":[{"name":"Staff","cidr":"10.20.0.0/23","ipv6":"2001:db8:20:10::/64","vlanId":10,"gateway":"10.20.0.1","purpose":"Employee access"},{"name":"Voice","cidr":"10.20.2.0/24","ipv6":"2001:db8:20:20::/64","vlanId":20,"gateway":"10.20.2.1","purpose":"Voice endpoints"},{"name":"Servers","cidr":"10.20.3.0/25","ipv6":"2001:db8:20:30::/64","vlanId":30,"gateway":"10.20.3.1","purpose":"Internal applications"},{"name":"Management","cidr":"10.20.3.128/26","ipv6":"2001:db8:20:40::/64","vlanId":40,"gateway":"10.20.3.129","purpose":"Device administration"},{"name":"Guest","cidr":"10.20.4.0/23","ipv6":"2001:db8:20:50::/64","vlanId":50,"gateway":"10.20.4.1","purpose":"Internet-only visitors"}],"reserved":["10.20.3.192/26","10.20.6.0/23","10.20.8.0/21"],"notes":"Allocate additional sites from disjoint blocks. Apply firewall rules consistently to IPv4 and IPv6 and reserve space for high availability where needed."}'::jsonb
),
(
  'campus-hierarchy',
  'Campus by building and department',
  'A hierarchy that reserves summarizable building blocks and separates student, staff, wireless, and management networks.',
  'campus',
  '{"schemaVersion":1,"parent":"10.64.0.0/12","ipv6Parent":"2001:db8:6400::/40","addressSpace":"campus","groups":[{"name":"Building A","cidr":"10.64.0.0/16","ipv6":"2001:db8:6400::/48"},{"name":"Building B","cidr":"10.65.0.0/16","ipv6":"2001:db8:6401::/48"}],"networks":[{"name":"A student labs","cidr":"10.64.0.0/22","ipv6":"2001:db8:6400:10::/64","vlanId":110,"gateway":"10.64.0.1","purpose":"Managed laboratory clients"},{"name":"A staff","cidr":"10.64.4.0/23","ipv6":"2001:db8:6400:20::/64","vlanId":120,"gateway":"10.64.4.1","purpose":"Faculty and staff"},{"name":"A wireless","cidr":"10.64.8.0/21","ipv6":"2001:db8:6400:30::/64","vlanId":130,"gateway":"10.64.8.1","purpose":"Wireless access pools"},{"name":"A management","cidr":"10.64.6.0/25","ipv6":"2001:db8:6400:40::/64","vlanId":140,"gateway":"10.64.6.1","purpose":"Infrastructure administration"},{"name":"B student labs","cidr":"10.65.0.0/22","ipv6":"2001:db8:6401:10::/64","vlanId":210,"gateway":"10.65.0.1","purpose":"Managed laboratory clients"},{"name":"B staff","cidr":"10.65.4.0/23","ipv6":"2001:db8:6401:20::/64","vlanId":220,"gateway":"10.65.4.1","purpose":"Faculty and staff"}],"reserved":["10.66.0.0/15","10.68.0.0/14","10.72.0.0/13"],"notes":"Building allocations are aggregate containers, not endpoint VLANs. Summaries advertise only deliberate parent blocks. Documentation prefixes are examples, not globally routed assignments."}'::jsonb
),
(
  'data-center-zones',
  'Data center service and management zones',
  'An example for management, compute, storage, service ingress, and point-to-point fabric addressing. Adapt sizes and routing to the deployment.',
  'data-center',
  '{"schemaVersion":1,"parent":"10.100.0.0/16","ipv6Parent":"2001:db8:100::/48","addressSpace":"dc-primary","networks":[{"name":"Management","cidr":"10.100.0.0/24","ipv6":"2001:db8:100:10::/64","vlanId":10,"gateway":"10.100.0.1","purpose":"Out-of-band device access","locked":true},{"name":"Compute","cidr":"10.100.4.0/22","ipv6":"2001:db8:100:20::/64","vlanId":20,"gateway":"10.100.4.1","purpose":"Workload access"},{"name":"Storage","cidr":"10.100.8.0/23","ipv6":"2001:db8:100:30::/64","vlanId":30,"gateway":"10.100.8.1","purpose":"Storage interfaces"},{"name":"Service ingress","cidr":"10.100.10.0/25","ipv6":"2001:db8:100:40::/64","vlanId":40,"gateway":"10.100.10.1","purpose":"Load balancers and ingress"},{"name":"Fabric link 1","cidr":"10.100.254.0/31","ipv6":"2001:db8:100:ff00::/127","purpose":"Inter-router link","policy":"point-to-point"},{"name":"Fabric link 2","cidr":"10.100.254.2/31","ipv6":"2001:db8:100:ff00::2/127","purpose":"Inter-router link","policy":"point-to-point"}],"reserved":["10.100.1.0/24","10.100.2.0/23","10.100.16.0/20","10.100.32.0/19","10.100.64.0/18","10.100.128.0/18"],"notes":"/31 IPv4 and /127 IPv6 rows are explicit point-to-point links. Endpoint LANs use /64 IPv6. This example does not assume that a subnet alone provides security isolation."}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  plan = excluded.plan,
  updated_at = now();
