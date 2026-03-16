module.exports = {
  apps: [
    {
      name: process.env.KID_CHAT_PM2_NAME || 'kid-chat-mvp',
      cwd: __dirname,
      script: 'npm',
      args: 'start -- --hostname 0.0.0.0 --port 3000',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
      },
    },
  ],
};
