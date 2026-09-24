const net = require('node:net');

function validateUICommand(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const allowedCommands = ['start', 'status', 'pause', 'resume', 'stop', 'repeat', 'notify-test', 'review'];
  if (!allowedCommands.includes(payload.command)) {
    return null;
  }

  const keys = Object.keys(payload);

  if (payload.command === 'start') {
    const expected = ['command', 'preset', 'intentionText', 'replace'];
    if (keys.length !== expected.length) return null;
    for (const k of expected) {
      if (!keys.includes(k)) return null;
    }
    if (!['start', 'flow', 'deep'].includes(payload.preset)) return null;
    if (typeof payload.intentionText !== 'string') return null;
    const trimmedIntention = payload.intentionText.trim();
    if (trimmedIntention.length === 0) return null;
    if (typeof payload.replace !== 'boolean') return null;

    return {
      command: 'start',
      preset: payload.preset,
      intentionText: trimmedIntention,
      replace: payload.replace
    };
  } else if (payload.command === 'review') {
    const expected = ['command', 'outcome', 'text'];
    if (keys.length !== expected.length) return null;
    for (const k of expected) {
      if (!keys.includes(k)) return null;
    }
    if (!['done', 'partial', 'switched'].includes(payload.outcome)) return null;
    if (typeof payload.text !== 'string') return null;

    return {
      command: 'review',
      outcome: payload.outcome,
      text: payload.text
    };
  } else {
    // pause/resume/stop/status/repeat/notify-test
    const expected = ['command'];
    if (keys.length !== expected.length) return null;
    if (keys[0] !== 'command') return null;

    return {
      command: payload.command
    };
  }
}

function sendDaemonCommand(socketPath, commandObj) {
  return new Promise((resolve, reject) => {
    // 1. 严格白名单校验以防套接字非法数据注入
    const validated = validateUICommand(commandObj);
    if (!validated) {
      return reject(new Error(`Validation failed: Invalid UI command structure. Raw: ${JSON.stringify(commandObj)}`));
    }

    const client = net.createConnection(socketPath);
    let responseData = '';
    let isResolved = false;

    // 设置 3 秒超时
    client.setTimeout(3000);

    client.on('data', (data) => {
      responseData += data.toString('utf8');
      if (responseData.includes('\n')) {
        client.end();
      }
    });

    client.on('end', () => {
      if (isResolved) return;
      isResolved = true;
      try {
        const payload = JSON.parse(responseData.trim());
        resolve(payload);
      } catch (err) {
        reject(new Error(`Failed to parse daemon response NDJSON: ${err.message}. Raw data: "${responseData}"`));
      }
    });

    client.on('timeout', () => {
      client.destroy();
      if (!isResolved) {
        isResolved = true;
        reject(new Error('Connection to daemon timed out'));
      }
    });

    client.on('error', (err) => {
      if (isResolved) return;
      isResolved = true;
      reject(err);
    });

    try {
      client.write(JSON.stringify(validated) + '\n');
    } catch (err) {
      if (!isResolved) {
        isResolved = true;
        reject(err);
      }
    }
  });
}

module.exports = {
  validateUICommand,
  sendDaemonCommand
};
