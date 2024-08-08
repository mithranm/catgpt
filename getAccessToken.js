const { exec } = require('child_process');

async function getGcloudAccessToken() {
  return new Promise((resolve, reject) => {
    exec('gcloud auth print-access-token', (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

module.exports = getGcloudAccessToken;