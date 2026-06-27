// Simple health-check endpoint. Confirms your Vercel /api backend is live.
// Visit https://YOUR-APP.vercel.app/api/health after deploy.
module.exports = (req, res) => {
  res.status(200).json({
    ok: true,
    service: "nathan",
    stage: "scaffold",
    time: new Date().toISOString()
  });
};
