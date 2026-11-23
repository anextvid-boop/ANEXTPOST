const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Health check
app.get('/health', (req, res) => res.send('OK'));

// Source endpoint – required by AGPL‑3.0 when offering the service over a network
app.get('/source', (req, res) => {
  res.redirect('https://github.com/anextvid-boop/ANEXTPOST');
});

const server = app.listen(port, () => console.log(`ANEXTPOST backend listening on port ${port}`));

// Graceful shutdown handling
function shutdown() {
  console.log('Received termination signal, shutting down gracefully...');
  server.close(() => {
    console.log('Closed out remaining connections. Exiting.');
    process.exit(0);
  });
  // Force quit after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, force exiting');
    process.exit(1);
  }, 10000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

