import {
  SpareHomeRam,
  SpareMoney,
  OwnedServerHostname
} from "/gfm/config.js"

/** @param {NS} ns */
export function getAllServerHostname(ns) {
  var root = "home";

  var servers = [];

  scanRecursive(root);

  function scanRecursive(root) {
    if (servers.findIndex((server) => server == root) != -1) {
      return;
    }

    servers.push(root);

    var bases = ns.scan(root);

    for(var i = 0; i < bases.length; i++) {
      var base = bases[i];
      scanRecursive(base);
    }
  }

  return servers;
}

/** @param {NS} ns */
export function nukeAllServer(ns) {
  const allServerHostnameList = getAllServerHostname(ns);
  const blackListedServerHostnameList = ["home"].concat(generateOwnedServerHostname());

  const serverHostnameList = allServerHostnameList.filter((serverHostname) => {
    for (var blackListedServerHostname of blackListedServerHostnameList) {
      if (serverHostname == blackListedServerHostname)
        return false;
    }
    return true;
  });


  var nukedServerHostnameList = [];

  for (var i = 0; i < serverHostnameList.length; i++) {
    var serverHostname = serverHostnameList[i];

    try {
      ns.brutessh(serverHostname);
    } catch {}

    try {
      ns.ftpcrack(serverHostname);
    } catch {}

    try {
      ns.ftpcrack(serverHostname);
    } catch {}

    try {
      ns.relaysmtp(serverHostname);
    } catch {}

    try {
      ns.sqlinject(serverHostname);
    } catch {}
    
    try {
      ns.nuke(serverHostname);

      nukedServerHostnameList.push(serverHostname);
    } catch {}
  }

  return nukedServerHostnameList;
}

/**
 * @param {NS} ns
 * 
 * @return {{ host: string; ram: number; }[]} usableHostAndRamList
*/
export function getUsableHostAndRamList(ns) {
  var rootedHostList = [].concat(
    getOwnedServerHostname(ns),
    nukeAllServer(ns)
  );

  const homeIndex = rootedHostList.indexOf("home");
  if (homeIndex > -1)
    rootedHostList.splice(homeIndex, 1);

  rootedHostList.push("home");

  var rootedHostAndRamList = rootedHostList.map((host) => {
    return {host: host, ram: ns.getServerMaxRam(host)};
  });
  var usableHostAndRamList = rootedHostAndRamList.filter((hostAndRam) => {
    return hostAndRam.ram != 0;
  });

  usableHostAndRamList[usableHostAndRamList.length - 1]["ram"] -= SpareHomeRam;
  if (usableHostAndRamList[usableHostAndRamList.length - 1]["ram"] < 0)
    usableHostAndRamList[usableHostAndRamList.length - 1]["ram"] == 0;

  return usableHostAndRamList;
}

export function generateOwnedServerHostname() {
  const ownedServerHostname = OwnedServerHostname;

  var ownedServerHostnameList = [];
  for (var i = 1; i <= 25; i++) {
    ownedServerHostnameList.push(ownedServerHostname + '-' + String(i).padStart(2, "0"));
  }
  return ownedServerHostnameList;
}

/** @param {NS} ns */
export function getOwnedServerHostname(ns) {
  var potentialOwnedServerHostnameList = ["home"].concat(generateOwnedServerHostname());

  var ownedServerHostnameList = potentialOwnedServerHostnameList.filter((serverHostname) => {
    try {
      ns.getServerMaxRam(serverHostname);
      return true;
    } catch {
      return false;
    }
  });

  return ownedServerHostnameList;
}

/** @param {NS} ns */
export function buyAndUpgradeOwnedServer(ns) {
  const startingRam = 2 ** 2; // 4 GB

  const spareMoney = SpareMoney;

  const generatedOwnedServerHostnameList = generateOwnedServerHostname();

  var notPurchasedServerHostnameList = generatedOwnedServerHostnameList.filter((generatedServerHostname) => {
    for (var serverHostname of getAllServerHostname(ns)) {
      if (generatedServerHostname == serverHostname)
        return false;
    }
    return true;
  });

  while (true) {
    if (notPurchasedServerHostnameList.length == 0)
      break;
    if (ns.getPlayer().money - spareMoney < ns.cloud.getServerCost(startingRam))
      break;
    var purchasingServerHostname = notPurchasedServerHostnameList.shift();

    ns.cloud.purchaseServer(purchasingServerHostname, startingRam);
    ns.print("Buy " + purchasingServerHostname + ", Ram: " + ns.format.ram(startingRam));
  }

  if (notPurchasedServerHostnameList != 0) return;

  while (true) {
    var upgradingServerIndex = 0;

    var lastGeneratedServerRam = null;
    for (var i = 0; i < generatedOwnedServerHostnameList.length; i++) {
      var generatedServerHostname = generatedOwnedServerHostnameList[i];

      var generatedServerRam = ns.getServerMaxRam(generatedServerHostname);

      if (lastGeneratedServerRam == null) {
        lastGeneratedServerRam = generatedServerRam;
        continue;
      }

      if (generatedServerRam != lastGeneratedServerRam) {
        upgradingServerIndex = i;
        break;
      }

      lastGeneratedServerRam = ns.getServerMaxRam(generatedServerHostname);
    }

    var upgradingServerHostname = generatedOwnedServerHostnameList[upgradingServerIndex];

    if (ns.getPlayer().money - spareMoney < ns.cloud.getServerUpgradeCost(
        upgradingServerHostname, ns.getServerMaxRam(upgradingServerHostname)*2
      ))
      break;

    var upgradingServerRam = ns.getServerMaxRam(upgradingServerHostname)*2;
                                                                                                                                                                                                    ns.cloud.upgradeServer(upgradingServerHostname, upgradingServerRam);
    ns.print("Upgrade " + upgradingServerHostname + ", Ram: " + ns.format.ram(upgradingServerRam));
  }
}