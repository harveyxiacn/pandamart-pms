/**
 * PandaMart PMS 启动管理器
 * 使用 Node.js 内置模块提供本地 GUI 控制面板
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const crypto = require('crypto');

const LAUNCHER_PORT = 9000;
const ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const CLIENT_DIR = path.join(ROOT, 'client');
const ENV_FILE = path.join(SERVER_DIR, '.env');
const LOGO_FILE = path.join(CLIENT_DIR, 'public', 'logo-300x292.png');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

let pmsProcess = null;
const tasks = {};

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function createTask(prefix, initialOutput = '') {
  const id = `${prefix}-${Date.now()}`;
  tasks[id] = {
    status: 'running',
    output: initialOutput,
    exitCode: null,
    startedAt: Date.now(),
  };
  return id;
}

function appendTaskOutput(taskId, chunk) {
  if (!tasks[taskId]) return;
  tasks[taskId].output += chunk.toString();
}

function setTaskResult(taskId, status, exitCode = null, output = '') {
  if (!tasks[taskId]) return;
  tasks[taskId].status = status;
  tasks[taskId].exitCode = exitCode;
  if (output) {
    appendTaskOutput(taskId, output);
  }
}

function readEnvConfig() {
  if (!fs.existsSync(ENV_FILE)) return null;

  const config = {};
  const raw = fs.readFileSync(ENV_FILE, 'utf8');
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) {
      config[match[1]] = match[2];
    }
  }

  return config;
}

function maskEnvConfig(config) {
  if (!config) return null;

  return {
    DB_HOST: config.DB_HOST || '127.0.0.1',
    DB_PORT: config.DB_PORT || '3306',
    DB_USER: config.DB_USER || 'root',
    DB_PASSWORD: config.DB_PASSWORD ? '••••••••' : '',
    DB_NAME: config.DB_NAME || 'pandamart_pms',
    PORT: config.PORT || '3000',
  };
}

function checkMysql() {
  const execOpts = { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] };

  try {
    execSync('where mysql', execOpts);
    const version = execSync('mysql --version', execOpts).trim();
    return { installed: true, version };
  } catch {}

  for (const serviceName of ['MySQL80', 'MySQL', 'MariaDB', 'MySQL57', 'MySQL84']) {
    try {
      const result = execSync(`sc query ${serviceName}`, execOpts);
      if (result.includes('RUNNING')) {
        return { installed: true, version: `${serviceName} service running` };
      }
      if (result.includes('STOPPED')) {
        return { installed: true, version: `${serviceName} service installed` };
      }
    } catch {}
  }

  try {
    const netstat = execSync('netstat -an', execOpts);
    if (netstat.includes(':3306') && netstat.includes('LISTENING')) {
      return { installed: true, version: 'MySQL/MariaDB listening on 3306' };
    }
  } catch {}

  return { installed: false, version: null };
}

function requestJson(targetUrl, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get(targetUrl, (resp) => {
      let body = '';

      resp.on('data', (chunk) => {
        body += chunk.toString();
      });

      resp.on('end', () => {
        try {
          resolve({
            statusCode: resp.statusCode || 0,
            body: body ? JSON.parse(body) : null,
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.setTimeout(timeout, () => {
      req.destroy(new Error('Request timed out'));
    });

    req.on('error', reject);
  });
}

async function checkServerReady(port) {
  try {
    const response = await requestJson(`http://127.0.0.1:${port}/api/v1/ready`);
    return response.statusCode === 200 && response.body?.success === true;
  } catch {
    return false;
  }
}

function getMysql2() {
  const mysql2Path = path.join(SERVER_DIR, 'node_modules', 'mysql2');
  if (!fs.existsSync(mysql2Path)) {
    throw new Error('请先完成“安装依赖”步骤');
  }
  return require(mysql2Path);
}

function testDatabaseConnection(config = {}) {
  return new Promise((resolve) => {
    try {
      const mysql2 = getMysql2();
      const connection = mysql2.createConnection({
        host: config.DB_HOST || '127.0.0.1',
        port: parseInt(config.DB_PORT || '3306', 10),
        user: config.DB_USER || 'root',
        password: config.DB_PASSWORD || '',
        database: config.DB_NAME || 'pandamart_pms',
        connectTimeout: 5000,
      });

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      connection.on('error', (err) => {
        finish({ success: false, error: err.message });
        try { connection.destroy(); } catch {}
      });

      connection.query('SELECT 1', (err) => {
        if (err) {
          finish({ success: false, error: err.message });
        } else {
          finish({ success: true, message: '数据库连接成功！' });
        }

        try { connection.end(); } catch {}
      });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

function createDatabase(config = {}) {
  return new Promise((resolve) => {
    try {
      const mysql2 = getMysql2();
      const connection = mysql2.createConnection({
        host: config.DB_HOST || '127.0.0.1',
        port: parseInt(config.DB_PORT || '3306', 10),
        user: config.DB_USER || 'root',
        password: config.DB_PASSWORD || '',
        connectTimeout: 5000,
      });

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      connection.on('error', (err) => {
        finish({ success: false, error: err.message });
        try { connection.destroy(); } catch {}
      });

      const dbName = config.DB_NAME || 'pandamart_pms';
      connection.query(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        (err) => {
          if (err) {
            finish({ success: false, error: err.message });
          } else {
            finish({ success: true, message: `数据库 ${dbName} 创建成功！` });
          }

          try { connection.end(); } catch {}
        }
      );
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

async function getStatus() {
  const envConfig = readEnvConfig();
  const serverPort = envConfig?.PORT || '3000';
  const mysql = checkMysql();
  const serverReady = await checkServerReady(serverPort);
  const trackedProcessRunning = pmsProcess !== null && !pmsProcess.killed && pmsProcess.exitCode === null;

  return {
    nodeVersion: process.version,
    mysqlInstalled: mysql.installed,
    mysqlVersion: mysql.version,
    envExists: fs.existsSync(ENV_FILE),
    envConfig: maskEnvConfig(envConfig),
    serverDepsInstalled: fs.existsSync(path.join(SERVER_DIR, 'node_modules')),
    clientDepsInstalled: fs.existsSync(path.join(CLIENT_DIR, 'node_modules')),
    serverBuilt: fs.existsSync(path.join(SERVER_DIR, 'dist', 'index.js')),
    clientBuilt: fs.existsSync(path.join(SERVER_DIR, 'public', 'index.html')),
    serverRunning: trackedProcessRunning || serverReady,
    serverReady,
    serverPort,
  };
}

function runLoggedProcess(command, cwd, taskId, envVars = {}) {
  const proc = spawn(command, {
    shell: true,
    cwd,
    env: { ...process.env, ...envVars },
  });

  proc.stdout.on('data', (chunk) => appendTaskOutput(taskId, chunk));
  proc.stderr.on('data', (chunk) => appendTaskOutput(taskId, chunk));
  proc.on('error', (error) => {
    setTaskResult(taskId, 'error', 1, `\n错误: ${error.message}`);
  });

  return proc;
}

function startServerProcess(taskId, port) {
  let settled = false;
  const readyLabel = `\n[READY] http://localhost:${port}`;

  const finishReady = () => {
    if (settled) return;
    settled = true;
    setTaskResult(taskId, 'done', 0, readyLabel);
  };

  pmsProcess = runLoggedProcess('node dist/index.js', SERVER_DIR, taskId, { NODE_ENV: 'production' });

  const readyTimer = setInterval(async () => {
    if (await checkServerReady(port)) {
      clearInterval(readyTimer);
      clearTimeout(timeoutTimer);
      finishReady();
    }
  }, 1000);

  const timeoutTimer = setTimeout(() => {
    if (settled) return;
    clearInterval(readyTimer);
    setTaskResult(taskId, 'error', 1, '\n启动超时：服务未通过就绪检查，请检查数据库与日志');
  }, 45000);

  pmsProcess.on('close', (code) => {
    clearInterval(readyTimer);
    clearTimeout(timeoutTimer);

    const exitCode = typeof code === 'number' ? code : 1;
    if (!settled) {
      setTaskResult(taskId, exitCode === 0 ? 'done' : 'error', exitCode, `\n服务已停止 (退出码: ${exitCode})`);
    } else if (tasks[taskId]) {
      appendTaskOutput(taskId, `\n服务已停止 (退出码: ${exitCode})`);
    }

    pmsProcess = null;
  });
}

async function handleAPI(req, res) {
  const urlPath = (req.url || '').split('?')[0];

  if (urlPath === '/api/status' && req.method === 'GET') {
    return json(res, { success: true, data: await getStatus() });
  }

  if (urlPath.startsWith('/api/task/') && req.method === 'GET') {
    const taskId = urlPath.split('/').pop();
    const task = tasks[taskId];
    if (!task) {
      return json(res, { success: false, error: '任务不存在' }, 404);
    }
    return json(res, { success: true, data: task });
  }

  if (urlPath === '/api/install-mysql' && req.method === 'POST') {
    const taskId = createTask('install-mysql', '正在启动 MySQL 安装脚本...\n');
    const script = path.join(SCRIPTS_DIR, 'install-mysql.ps1');
    const proc = runLoggedProcess(`powershell -ExecutionPolicy Bypass -File "${script}"`, ROOT, taskId);
    proc.on('close', (code) => {
      if (tasks[taskId]?.status === 'error') return;
      setTaskResult(taskId, code === 0 ? 'done' : 'error', code, code === 0 ? '\n✅ MySQL 安装脚本执行完成，请刷新页面查看状态。' : '');
    });
    return json(res, { success: true, taskId });
  }

  if (urlPath === '/api/create-database' && req.method === 'POST') {
    const body = await readBody(req);
    const result = await createDatabase({
      DB_HOST: body.DB_HOST || '127.0.0.1',
      DB_PORT: body.DB_PORT || '3306',
      DB_USER: body.DB_USER || 'root',
      DB_PASSWORD: body.DB_PASSWORD || '',
      DB_NAME: body.DB_NAME || 'pandamart_pms',
    });

    if (!result.success) {
      return json(res, { success: false, error: `创建失败: ${result.error}` });
    }

    return json(res, { success: true, message: result.message });
  }

  if (urlPath === '/api/save-config' && req.method === 'POST') {
    const body = await readBody(req);
    const lines = [
      '# PandaMart PMS 配置（由管理器自动生成）',
      `PORT=${body.PORT || '3000'}`,
      'NODE_ENV=production',
      '',
      `DB_HOST=${body.DB_HOST || '127.0.0.1'}`,
      `DB_PORT=${body.DB_PORT || '3306'}`,
      `DB_USER=${body.DB_USER || 'root'}`,
      `DB_PASSWORD=${body.DB_PASSWORD || ''}`,
      `DB_NAME=${body.DB_NAME || 'pandamart_pms'}`,
      '',
      `JWT_SECRET=${body.JWT_SECRET || crypto.randomBytes(24).toString('hex')}`,
      'JWT_EXPIRES_IN=86400',
      '',
      `AI_ENCRYPTION_KEY=${body.AI_ENCRYPTION_KEY || crypto.randomBytes(16).toString('hex')}`,
      '',
      `CORS_ORIGIN=http://localhost:${body.PORT || '3000'}`,
      '',
      'UPLOAD_DIR=uploads',
      'MAX_FILE_SIZE=20971520',
    ];

    fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf8');
    return json(res, { success: true, message: '配置已保存' });
  }

  if (urlPath === '/api/generate-keys' && req.method === 'POST') {
    return json(res, {
      success: true,
      data: {
        JWT_SECRET: crypto.randomBytes(24).toString('hex'),
        AI_ENCRYPTION_KEY: crypto.randomBytes(16).toString('hex'),
      },
    });
  }

  if (urlPath === '/api/test-db' && req.method === 'POST') {
    const result = await testDatabaseConnection(readEnvConfig() || {});
    if (!result.success) {
      return json(res, { success: false, error: `数据库连接失败: ${result.error}` });
    }
    return json(res, { success: true, message: result.message || '数据库连接成功！' });
  }

  if (urlPath === '/api/install-deps' && req.method === 'POST') {
    const taskId = createTask('install', '开始安装后端依赖...\n');
    const serverInstall = runLoggedProcess('npm install', SERVER_DIR, taskId);

    serverInstall.on('close', (code) => {
      if (code !== 0) {
        setTaskResult(taskId, 'error', code, '\n❌ 后端依赖安装失败');
        return;
      }

      appendTaskOutput(taskId, '\n后端依赖安装完成，开始安装前端依赖...\n');
      const clientInstall = runLoggedProcess('npm install', CLIENT_DIR, taskId);
      clientInstall.on('close', (code2) => {
        setTaskResult(
          taskId,
          code2 === 0 ? 'done' : 'error',
          code2,
          code2 === 0 ? '\n✅ 所有依赖安装完成！' : '\n❌ 前端依赖安装失败'
        );
      });
    });

    return json(res, { success: true, taskId });
  }

  if (urlPath === '/api/init-db' && req.method === 'POST') {
    const taskId = createTask('initdb', '开始数据库迁移（创建表结构）...\n');
    const migrateCmd = 'npx tsx ./node_modules/knex/bin/cli.js migrate:latest --knexfile src/config/knexfile.ts';
    const migrateProc = runLoggedProcess(migrateCmd, SERVER_DIR, taskId);

    migrateProc.on('close', (code) => {
      if (code !== 0) {
        setTaskResult(taskId, 'error', code, '\n❌ 数据库迁移失败，请检查数据库连接配置');
        return;
      }

      appendTaskOutput(taskId, '\n表结构创建完成，开始导入初始数据...\n');
      const seedCmd = 'npx tsx ./node_modules/knex/bin/cli.js seed:run --knexfile src/config/knexfile.ts';
      const seedProc = runLoggedProcess(seedCmd, SERVER_DIR, taskId);
      seedProc.on('close', (code2) => {
        setTaskResult(
          taskId,
          code2 === 0 ? 'done' : 'error',
          code2,
          code2 === 0 ? '\n✅ 数据库初始化完成！\n管理员账号：admin（密码为你设置的 SEED_ADMIN_PASSWORD）' : '\n❌ 初始数据导入失败'
        );
      });
    });

    return json(res, { success: true, taskId });
  }

  if (urlPath === '/api/build' && req.method === 'POST') {
    const taskId = createTask('build', '开始构建前端...\n');
    const clientBuild = runLoggedProcess('npm run build', CLIENT_DIR, taskId);

    clientBuild.on('close', (code) => {
      if (code !== 0) {
        setTaskResult(taskId, 'error', code, '\n❌ 前端构建失败');
        return;
      }

      appendTaskOutput(taskId, '\n前端构建完成，开始构建后端...\n');
      const serverBuild = runLoggedProcess('npm run build', SERVER_DIR, taskId);
      serverBuild.on('close', (code2) => {
        setTaskResult(
          taskId,
          code2 === 0 ? 'done' : 'error',
          code2,
          code2 === 0 ? '\n✅ 前后端构建完成！' : '\n❌ 后端构建失败'
        );
      });
    });

    return json(res, { success: true, taskId });
  }

  if (urlPath === '/api/start-server' && req.method === 'POST') {
    const envConfig = readEnvConfig();
    const port = envConfig?.PORT || '3000';

    if (!envConfig) {
      return json(res, { success: false, error: '请先保存数据库和端口配置' }, 400);
    }

    if (!fs.existsSync(path.join(SERVER_DIR, 'dist', 'index.js'))) {
      return json(res, { success: false, error: '请先完成“构建系统”步骤' }, 400);
    }

    if (await checkServerReady(port)) {
      return json(res, { success: false, error: '系统已在运行中' }, 400);
    }

    if (pmsProcess && !pmsProcess.killed && pmsProcess.exitCode === null) {
      return json(res, { success: false, error: '服务正在启动中，请稍候' }, 400);
    }

    const dbCheck = await testDatabaseConnection(envConfig);
    if (!dbCheck.success) {
      return json(res, {
        success: false,
        error: `数据库未就绪：${dbCheck.error}。请先安装/启动 MySQL，并完成数据库连接测试。`,
      }, 400);
    }

    const taskId = createTask('server', '启动 PandaMart PMS 服务...\n');
    startServerProcess(taskId, port);
    return json(res, { success: true, taskId });
  }

  if (urlPath === '/api/stop-server' && req.method === 'POST') {
    if (!pmsProcess || pmsProcess.killed || pmsProcess.exitCode !== null) {
      return json(res, { success: false, error: '当前没有由管理器启动的服务进程' }, 400);
    }

    pmsProcess.kill('SIGTERM');
    if (process.platform === 'win32' && pmsProcess.pid) {
      spawn(`taskkill /PID ${pmsProcess.pid} /T /F`, { shell: true });
    }

    return json(res, { success: true, message: '正在停止服务...' });
  }

  return json(res, { success: false, error: '未知接口' }, 404);
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '').split('?')[0];

  if (urlPath.startsWith('/api/')) {
    handleAPI(req, res);
    return;
  }

  if (urlPath === '/logo.png') {
    if (fs.existsSync(LOGO_FILE)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(fs.readFileSync(LOGO_FILE));
      return;
    }

    res.writeHead(404);
    res.end();
    return;
  }

  const htmlFile = path.join(__dirname, 'index.html');
  if (fs.existsSync(htmlFile)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(htmlFile, 'utf8'));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

process.on('uncaughtException', (err) => {
  console.error('[launcher error]', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('[launcher error]', err);
});

server.listen(LAUNCHER_PORT, () => {
  console.log(`PandaMart PMS 管理器已启动: http://localhost:${LAUNCHER_PORT}`);
});
