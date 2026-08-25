# Owner context

This is the primary Ubuntu WSL distro.

Ownership:
- This WSL belongs to the current personal harness owner.
- Treat /home/hamza/repo as the normal repository root.
- Do not modify another user's home or configuration.

Graphics:
- WSLg uses /dev/dxg.
- NVIDIA RTX 3070 Ti through Windows driver.
- Mesa uses Gallium D3D12.
- Gecko applications use native Wayland.
- Chromium/Electron use X11/XWayland.
- Do not install Linux NVIDIA display drivers.

Configuration boundary:
- Machine-specific settings belong under ~/.config/mcp-dev-bridge.
- Do not add machine-specific paths/preferences to tracked repository configuration.
