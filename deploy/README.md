# Automatic production deployment

GitHub Actions runs `.github/workflows/ci.yml` for every push to `main`. The
production server checks GitHub every two minutes and deploys only when that
exact commit has a successful `push` workflow run.

The server-side deployer:

1. refuses to run over tracked local changes;
2. fetches `origin/main` and verifies its CI conclusion through GitHub's API;
3. performs a fast-forward-only update;
4. installs locked frontend and declared backend dependencies;
5. builds the Next.js production bundle;
6. restarts only `ssel-backend.service` and `ssel-frontend.service`;
7. records the commit only after both local health checks pass.

The installed `/usr/local/sbin/ssel-auto-deploy` copy must remain owned by root.
The application checkout and build commands run as `jkl499`.

Useful server commands:

```bash
sudo systemctl status ssel-auto-deploy.timer --no-pager
sudo systemctl start ssel-auto-deploy.service
sudo journalctl -u ssel-auto-deploy.service -n 100 --no-pager
```
