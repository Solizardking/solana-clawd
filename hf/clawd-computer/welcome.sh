#!/usr/bin/env bash
cat <<'BANNER'
   ____ _                  _    ____                            _
  / ___| | __ ___      ____| |  / ___|___  _ __ ___  _ __  _   _| |_ ___ _ __
 | |   | |/ _` \ \ /\ / / _` | | |   / _ \| '_ ` _ \| '_ \| | | | __/ _ \ '__|
 | |___| | (_| |\ V  V / (_| | | |__| (_) | | | | | | |_) | |_| | ||  __/ |
  \____|_|\__,_| \_/\_/ \__,_|  \____\___/|_| |_| |_| .__/ \__,_|\__\___|_|
                                                    |_|
BANNER
echo ""
echo "  🐾 Welcome to the Clawd Computer — homebase on Hugging Face"
echo "  ----------------------------------------------------------"
echo "  Pre-installed: python3 · node $(node -v 2>/dev/null) · git · hf · jq · rg"
echo "  HF CLI:        run 'hf auth whoami' (set HF_TOKEN in Space secrets)"
echo "  Org:           https://huggingface.co/solanaclawd"
echo ""
