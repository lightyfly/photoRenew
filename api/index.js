let appPromise;

function loadApp() {
  if (!appPromise) {
    appPromise = import('../backend/src/index.js').then((mod) => mod.default);
  }
  return appPromise;
}

module.exports = async (req, res) => {
  const app = await loadApp();
  return app(req, res);
};
