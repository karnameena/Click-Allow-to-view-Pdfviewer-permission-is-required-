function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Karna Server Activated GK</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #030607;
  color: #eafff7;
  font-family: Consolas, "Courier New", monospace;
}

.container {
  width: 94%;
  max-width: 1400px;
  margin: auto;
  padding: 25px 0 50px;
}

header {
  height: 65px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #193039;
}

.logo {
  color: #00ff9d;
  font-weight: bold;
  font-size: 20px;
}

.online {
  color: #00ff9d;
  font-size: 12px;
}

.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  background: #00ff9d;
  border-radius: 50%;
  margin-right: 7px;
  box-shadow: 0 0 12px #00ff9d;
}

.hero {
  text-align: center;
  padding: 70px 10px;
}

.hero h1 {
  margin: 0;
  color: #00ff9d;
  font-size: clamp(28px, 5vw, 58px);
  text-shadow: 0 0 25px rgba(0,255,157,.35);
}

.hero p {
  color: #63817a;
  margin-top: 15px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
}

.card,
.panel {
  background: #091014;
  border: 1px solid #193039;
  border-radius: 12px;
}

.card {
  padding: 20px;
}

.title {
  color: #63817a;
  font-size: 11px;
}

.value {
  color: #00ff9d;
  font-size: 28px;
  font-weight: bold;
  margin-top: 10px;
}

.info {
  color: #45625c;
  font-size: 10px;
  margin-top: 8px;
}

.main {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 18px;
  margin-top: 18px;
}

.panel {
  overflow: hidden;
}

.panel-header {
  padding: 16px 18px;
  border-bottom: 1px solid #193039;
  color: #00ff9d;
  font-size: 11px;
}

.panel-body {
  padding: 20px;
}

.monitor {
  display: flex;
  justify-content: space-around;
  align-items: center;
  gap: 20px;
  padding: 25px 0;
}

.circle {
  width: 155px;
  height: 155px;
  border-radius: 50%;
  border: 7px solid rgba(0,255,157,.12);
  outline: 2px solid rgba(0,255,157,.3);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.circle-value {
  color: #00ff9d;
  font-size: 30px;
  font-weight: bold;
}

.circle-label {
  color: #63817a;
  font-size: 10px;
  margin-top: 6px;
}

.graph {
  height: 120px;
  display: flex;
  align-items: flex-end;
  gap: 4px;
  border-top: 1px solid #12252c;
  padding-top: 15px;
}

.bar {
  flex: 1;
  background: #00ff9d;
  opacity: .55;
  border-radius: 3px 3px 0 0;
  min-height: 3px;
}

.row {
  display: flex;
  justify-content: space-between;
  padding: 13px 0;
  border-bottom: 1px solid #12252c;
  font-size: 11px;
  gap: 15px;
}

.label {
  color: #63817a;
}

.data {
  color: #00d9ff;
  text-align: right;
  word-break: break-word;
}

.terminal {
  background: #020405;
  padding: 18px;
  min-height: 230px;
  line-height: 1.8;
  font-size: 11px;
  color: #70cba8;
}

.green {
  color: #00ff9d;
}

.port {
  display: flex;
  justify-content: space-between;
  padding: 13px;
  margin-bottom: 8px;
  background: #060c10;
  border: 1px solid #12252c;
  border-radius: 8px;
}

.port-number {
  color: #00d9ff;
}

.port-status {
  color: #00ff9d;
  font-size: 10px;
}

footer {
  text-align: center;
  color: #304943;
  font-size: 10px;
  margin-top: 30px;
}

@media (max-width: 1050px) {
  .cards {
    grid-template-columns: repeat(2, 1fr);
  }

  .main {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .cards {
    grid-template-columns: 1fr;
  }

  .monitor {
    flex-direction: column;
  }

  .hero {
    padding: 50px 10px;
  }

  .hero h1 {
    font-size: 30px;
  }

  header {
    padding: 0 10px;
  }
}
</style>
</head>

<body>

<div class="container">

<header>
  <div class="logo">GK // KARNA SECURITY CORE</div>

  <div class="online">
    <span class="dot"></span>
    SYSTEM ONLINE
  </div>
</header>

<section class="hero">
  <h1>Karna Server Activated GK</h1>
  <p>REAL-TIME SERVER TELEMETRY // SYSTEM MONITORING</p>
</section>

<section class="cards">

  <div class="card">
    <div class="title">CPU USAGE</div>
    <div class="value" id="cpuCard">0%</div>
    <div class="info" id="cpuInfo">Loading...</div>
  </div>

  <div class="card">
    <div class="title">RAM USAGE</div>
    <div class="value" id="ramCard">0%</div>
    <div class="info" id="ramInfo">Loading...</div>
  </div>

  <div class="card">
    <div class="title">LOCAL IP</div>
    <div class="value" id="localIP">...</div>
    <div class="info">SERVER INTERFACE</div>
  </div>

  <div class="card">
    <div class="title">GLOBAL IP</div>
    <div class="value" id="globalIP">...</div>
    <div class="info">PUBLIC ADDRESS</div>
  </div>

</section>

<section class="main">

<div>

  <div class="panel">

    <div class="panel-header">
      LIVE RESOURCE MONITOR
      <span id="clock"></span>
    </div>

    <div class="panel-body">

      <div class="monitor">

        <div class="circle">
          <div class="circle-value" id="cpuCircle">0%</div>
          <div class="circle-label">CPU LOAD</div>
        </div>

        <div class="circle">
          <div class="circle-value" id="ramCircle">0%</div>
          <div class="circle-label">RAM LOAD</div>
        </div>

      </div>

      <div class="graph" id="graph"></div>

    </div>

  </div>

  <div class="panel" style="margin-top:18px">

    <div class="panel-header">
      SYSTEM TERMINAL
    </div>

    <div class="terminal">

      <div>
        <span class="green">karna@gk</span>:~$ server --status
      </div>

      <div>Initializing Karna Security Core...</div>
      <div>Loading system telemetry...</div>
      <div>Network interface detected...</div>
      <div>Monitoring engine started...</div>

      <div class="green">
        [OK] KARNA SERVER ACTIVATED GK
      </div>

      <br>

      <div>
        <span class="green">karna@gk</span>:~$
        <span id="terminalStatus">monitoring...</span>
      </div>

    </div>

  </div>

</div>

<div>

  <div class="panel">

    <div class="panel-header">
      SERVER INFORMATION
    </div>

    <div class="panel-body">

      <div class="row">
        <span class="label">STATUS</span>
        <span class="data" id="serverStatus">ONLINE</span>
      </div>

      <div class="row">
        <span class="label">HOSTNAME</span>
        <span class="data" id="hostname">...</span>
      </div>

      <div class="row">
        <span class="label">NODE</span>
        <span class="data" id="node">...</span>
      </div>

      <div class="row">
        <span class="label">PLATFORM</span>
        <span class="data" id="platform">...</span>
      </div>

      <div class="row">
        <span class="label">SYSTEM UPTIME</span>
        <span class="data" id="systemUptime">...</span>
      </div>

      <div class="row">
        <span class="label">SERVER UPTIME</span>
        <span class="data" id="serverUptime">...</span>
      </div>

    </div>

  </div>

  <div class="panel" style="margin-top:18px">

    <div class="panel-header">
      PORT MONITOR
    </div>

    <div class="panel-body" id="ports">
      Loading...
    </div>

  </div>

</div>

</section>

<footer>
  KARNA SECURITY CORE // REAL-TIME SERVER MONITOR
</footer>

</div>

<script>

const cpuCard = document.getElementById("cpuCard");
const ramCard = document.getElementById("ramCard");

const cpuCircle = document.getElementById("cpuCircle");
const ramCircle = document.getElementById("ramCircle");

const cpuInfo = document.getElementById("cpuInfo");
const ramInfo = document.getElementById("ramInfo");

const localIP = document.getElementById("localIP");
const globalIP = document.getElementById("globalIP");

const hostname = document.getElementById("hostname");
const node = document.getElementById("node");
const platform = document.getElementById("platform");

const systemUptime =
  document.getElementById("systemUptime");

const serverUptime =
  document.getElementById("serverUptime");

const serverStatus =
  document.getElementById("serverStatus");

const terminalStatus =
  document.getElementById("terminalStatus");

const graph =
  document.getElementById("graph");

const ports =
  document.getElementById("ports");

const cpuHistory = [];
const ramHistory = [];

function updateClock() {

  document.getElementById("clock").textContent =
    new Date().toLocaleTimeString([], {
      hour12: false
    });

}

setInterval(updateClock, 1000);
updateClock();

function drawGraph() {

  graph.innerHTML = "";

  for (let i = 0; i < cpuHistory.length; i++) {

    const bar =
      document.createElement("div");

    bar.className = "bar";

    const value =
      Math.max(
        cpuHistory[i],
        ramHistory[i] || 0
      );

    bar.style.height =
      Math.max(3, value) + "%";

    graph.appendChild(bar);
  }

}

async function loadStats() {

  try {

    const response =
      await fetch("/api/stats", {
        cache: "no-store"
      });

    if (!response.ok) {
      throw new Error("API error");
    }

    const data =
      await response.json();

    cpuCard.textContent =
      data.cpu.usage + "%";

    cpuCircle.textContent =
      data.cpu.usage + "%";

    cpuInfo.textContent =
      data.cpu.cores + " CPU CORES";

    ramCard.textContent =
      data.ram.percentage + "%";

    ramCircle.textContent =
      data.ram.percentage + "%";

    ramInfo.textContent =
      data.ram.used + " / " + data.ram.total;

    localIP.textContent =
      data.network.localIP;

    globalIP.textContent =
      data.network.globalIP;

    hostname.textContent =
      data.server.hostname;

    node.textContent =
      data.server.node;

    platform.textContent =
      data.server.platform +
      " / " +
      data.server.architecture;

    systemUptime.textContent =
      data.uptime.system;

    serverUptime.textContent =
      data.uptime.server;

    serverStatus.textContent =
      data.status;

    cpuHistory.push(
      data.cpu.usage
    );

    ramHistory.push(
      data.ram.percentage
    );

    if (cpuHistory.length > 35) {
      cpuHistory.shift();
      ramHistory.shift();
    }

    drawGraph();

    terminalStatus.textContent =
      "telemetry stream active";

  } catch (error) {

    serverStatus.textContent =
      "OFFLINE";

    terminalStatus.textContent =
      "telemetry connection failed";

  }

}

async function loadPorts() {

  try {

    const response =
      await fetch("/api/ports");

    const data =
      await response.json();

    ports.innerHTML = "";

    data.ports.forEach(function(item) {

      const div =
        document.createElement("div");

      div.className = "port";

      div.innerHTML =
        '<span class="port-number">:' +
        item.port +
        ' - ' +
        item.service +
        '</span>' +
        '<span class="port-status">● ' +
        item.status +
        '</span>';

      ports.appendChild(div);

    });

  } catch (error) {

    ports.textContent =
      "Port monitor unavailable";

  }

}

loadStats();
loadPorts();

setInterval(loadStats, 2000);
setInterval(loadPorts, 10000);

</script>

</body>
</html>`;
}

module.exports = getDashboardHTML;
