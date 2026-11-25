# REQUIREMENT: PHP must be installed.
#
# Download PHP:
# https://www.php.net/downloads
#
# Ubuntu/Linux users can install PHP using:
# sudo apt update
# sudo apt install php
#
# Verify installation:
# php -v

set -e
cd "$(dirname "$0")"
if ! command -v php >/dev/null 2>&1; then
  echo "PHP is required. Install PHP and run this script again."
  exit 1
fi
echo "Starting MediaPlay at http://$(hostname '{print $1}'):8080"

php -S 0.0.0.0:8080
