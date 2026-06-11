<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  oslan/ — OS-level LAN agent networking             ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
  ___  ____  _        _    _   _
 / _ \/ ___|| |      / \  | \ | |
| | | \___ \| |     / _ \ |  \| |
| |_| |___) | |___ / ___ \| |\  |
 \___/|____/|_____/_/   \_\_| \_|
```

**OS-level LAN networking for CLAWD agent fleets**

</div>

---

## What it does

`oslan/` provides OS-level local-area network primitives for multi-agent coordination — letting agents discover and communicate with each other on the same network without going through the cloud.

## Use cases

- **Agent discovery** — agents find each other on the LAN via mDNS/Bonjour
- **Local swarms** — run a fleet of agents coordinated over localhost
- **Air-gapped testing** — test multi-agent patterns without external dependencies
- **Hardware integration** — connect to BitAxe miners and local hardware over LAN

## Integration

`oslan/` is used by the box runners and the livekit-agent backrooms for peer-to-peer agent coordination.

---

> See also: [box/](../box/) · [livekit-agent/](../livekit-agent/) · MIT
