import { ServerConstants } from '/gfm/utils/constants.js'

export const HackSecurity = ServerConstants.ServerFortifyAmount
export const GrowSecurity = 2 * ServerConstants.ServerFortifyAmount

/** @param {NS} ns */
export function calculateHGWExpGain(ns, host, hackingExpMult = 1.0, bitNodeHackExpGain = 1.0) {
    const baseDifficulty = ns.getServerBaseSecurityLevel(host)
    if (!baseDifficulty) return 0
    const baseExpGain = 3
    const diffFactor = 0.3
    let expGain = baseExpGain
    expGain += baseDifficulty * diffFactor
    // return expGain * person.mults.hacking_exp * currentNodeMults.HackExpGain;
    return expGain * hackingExpMult * bitNodeHackExpGain
}

function calculateIntelligenceBonus(intelligence, weight = 1) {
    return 1 + (weight * Math.pow(intelligence, 0.8)) / 600
}

/** @param {NS} ns */
export function calculateHackTime(
    ns,
    host,
    serverSecurityLevel,
    hackingLevel,
    intelligenceLevel,
    hackingSpeedMult = 1.0,
    bitNodeHackingSpeedMult = 1.0
) {
    const hackDifficulty = serverSecurityLevel
    const requiredHackingSkill = ns.getServerRequiredHackingLevel(host)

    if (typeof hackDifficulty !== 'number' || typeof requiredHackingSkill !== 'number')
        return Infinity
    const difficultyMult = requiredHackingSkill * hackDifficulty

    const baseDiff = 500
    const baseSkill = 50
    const diffFactor = 2.5
    let skillFactor = diffFactor * difficultyMult + baseDiff
    skillFactor /= hackingLevel + baseSkill

    const hackTimeMultiplier = 5
    const hackingTime =
        (hackTimeMultiplier * skillFactor) /
        (hackingSpeedMult *
            bitNodeHackingSpeedMult *
            calculateIntelligenceBonus(intelligenceLevel, 1))

    return hackingTime * 1000
}

export function calculateGrowTime(hackingTime) {
    const growTimeMultiplier = 3.2 // Relative to hacking time. 16/5 = 3.2

    return growTimeMultiplier * hackingTime
}

export function calculateWeakenTime(hackingTime) {
    const weakenTimeMultiplier = 4 // Relative to hacking time

    return weakenTimeMultiplier * hackingTime
}

/** @param {NS} ns */
export function calculateHackChance(
    ns,
    host,
    serverSecurityLevel,
    hackingLevel,
    intelligenceLevel,
    hackingChanceMult = 1.0
) {
    const hackDifficulty = serverSecurityLevel ?? 100
    const requiredHackingSkill = ns.getServerRequiredHackingLevel(host) ?? 1e9
    // Unrooted or unhackable server
    if (!ns.hasRootAccess(host) || hackDifficulty >= 100) return 0
    const hackFactor = 1.75
    const difficultyMult = (100 - hackDifficulty) / 100
    const skillMult = clampNumber(hackFactor * hackingLevel, 1)
    const skillChance = (skillMult - requiredHackingSkill) / skillMult
    const chance =
        skillChance *
        difficultyMult *
        hackingChanceMult *
        calculateIntelligenceBonus(intelligenceLevel, 1)
    return clampNumber(chance, 0, 1)
}

/** @param {NS} ns */
export function calculatePercentHacked(
    ns,
    host,
    serverSecurityLevel,
    hackingLevel,
    hackingMoneyMult = 1.0,
    bitNodeHackMoneyMult = 1.0
) {
    const hackDifficulty = serverSecurityLevel ?? 100
    if (hackDifficulty >= 100) return 0
    const requiredHackingSkill = ns.getServerRequiredHackingLevel(host) ?? 1e9
    // Adjust if needed for balancing. This is the divisor for the final calculation
    const balanceFactor = 240

    const difficultyMult = (100 - hackDifficulty) / 100
    const skillMult = (hackingLevel - (requiredHackingSkill - 1)) / hackingLevel
    // const percentMoneyHacked =
    //   (difficultyMult * skillMult * person.mults.hacking_money * currentNodeMults.ScriptHackMoney) / balanceFactor;
    const percentMoneyHacked =
        (difficultyMult * skillMult * hackingMoneyMult * bitNodeHackMoneyMult) / balanceFactor

    return Math.min(1, Math.max(percentMoneyHacked, 0))
}

function getCoreBonus(cores = 1) {
    const coreBonus = 1 + (cores - 1) / 16
    return coreBonus
}

/** @param {NS} ns */
export function calculateGrowthLog(
    ns,
    host,
    serverSecurityLevel,
    hackingGrowthMult = 1.0,
    bitNodeGrowthMult = 1.0,
    cores = 1
) {
    const serverGrowth = ns.getServerGrowth(host)

    if (!serverGrowth) return null
    const hackDifficulty = serverSecurityLevel ?? 100

    //Get adjusted growth log, which accounts for server security
    //log1p computes log(1+p), it is far more accurate for small values.
    let adjGrowthLog = Math.log1p(ServerConstants.ServerBaseGrowthIncr / hackDifficulty)
    if (adjGrowthLog >= ServerConstants.ServerMaxGrowthLog) {
        adjGrowthLog = ServerConstants.ServerMaxGrowthLog
    }

    //Calculate adjusted server growth rate based on parameters
    const serverGrowthPercentage = serverGrowth / 100
    const serverGrowthPercentageAdjusted = serverGrowthPercentage * bitNodeGrowthMult

    //Apply serverGrowth for the calculated number of growth cycles
    const coreBonus = getCoreBonus(cores)
    // It is critical that numServerGrowthCycles (aka threads) is multiplied last,
    // so that it rounds the same way as numCycleForGrowthCorrected.
    return adjGrowthLog * serverGrowthPercentageAdjusted * hackingGrowthMult * coreBonus
}

/** @param {NS} ns */
export function calculateWeakenEffect(bitNodeWeakenRate = 1.0, cores = 1) {
    const coreBonus = getCoreBonus(cores)
    return ServerConstants.ServerWeakenAmount * coreBonus * bitNodeWeakenRate
}

/** @param {NS} ns */
export function calculateHackThreads(startMoney, targetMoney, percentHacked) {
    if (startMoney < 0) startMoney = 0
    if (startMoney <= targetMoney) return 0

    // Use floor so that it won't over hack
    return Math.floor((startMoney - targetMoney) / (startMoney * percentHacked))
}

/** @param {NS} ns */
export function calculateGrowThreads(startMoney, targetMoney, growthLog) {
    if (startMoney < 0) startMoney = 0
    if (targetMoney <= startMoney) return 0

    const k = growthLog

    const guess =
        (targetMoney - startMoney) / (1 + (targetMoney * (1 / 16) + startMoney * (15 / 16)) * k)
    let x = guess
    let diff
    do {
        const ox = startMoney + x
        // Have to use division instead of multiplication by inverse, because
        // if targetMoney is MIN_VALUE then inverting gives Infinity
        const newx = (x - ox * Math.log(ox / targetMoney)) / (1 + ox * k)
        diff = newx - x
        x = newx
    } while (diff < -1 || diff > 1)
    /* If we see a diff of 1 or less we know all future diffs will be smaller, and the rate of
   * convergence means the *sum* of the diffs will be less than 1.

   * In most cases, our result here will be ceil(x).
   */
    const ccycle = Math.ceil(x)
    if (ccycle - x > 0.999999) {
        // Rounding-error path: It's possible that we slightly overshot the integer value due to
        // rounding error, and more specifically precision issues with log and the size difference of
        // startMoney vs. x. See if a smaller integer works. Most of the time, x was not close enough
        // that we need to try.
        const fcycle = ccycle - 1
        if (targetMoney <= (startMoney + fcycle) * Math.exp(k * fcycle)) {
            return fcycle
        }
    }
    if (ccycle >= x + ((diff <= 0 ? -diff : diff) + 0.000001)) {
        // Fast-path: We know the true value is somewhere in the range [x, x + |diff|] but the next
        // greatest integer is past this. Since we have to round up grows anyway, we can return this
        // with no more calculation. We need some slop due to rounding errors - we can't fast-path
        // a value that is too small.
        return ccycle
    }
    if (targetMoney <= (startMoney + ccycle) * Math.exp(k * ccycle)) {
        return ccycle
    }
    return ccycle + 1
}

/** @param {NS} ns */
export function calculateWeakenThreads(reducingSecurity, weakenEffect) {
    return Math.ceil(reducingSecurity / weakenEffect)
}

export const HackScript = {
    name: '/gfm/spreadingScripts/hack.js',
    ram: 1.7,
}
export const GrowScript = {
    name: '/gfm/spreadingScripts/grow.js',
    ram: 1.75,
}
export const WeakenScript = {
    name: '/gfm/spreadingScripts/weaken.js',
    ram: 1.75,
}
export const ShareScript = {
    name: '/gfm/spreadingScripts/share.js',
    ram: 4.0,
}

/**
 * @param {NS} ns
 * @param {{ host: string; ram: number; }[]} hostAndRamList
 */
export function spreadScripts(ns, hostAndRamList) {
    for (var hostAndRam of hostAndRamList) {
        if (hostAndRam.host == 'home') continue

        ns.scp(HackScript.name, hostAndRam.host, 'home')
        ns.scp(WeakenScript.name, hostAndRam.host, 'home')
        ns.scp(GrowScript.name, hostAndRam.host, 'home')
    }
}

/**
 * @param {{ name: string; ram: number; }} script
 * @param {number} threads
 * @param {{ host: string; ram: number; }[]} hostAndRamList
 *
 * @return {{ hostAndRamList: { host: string; ram: number; }[]; threadsLeftToRun: number; }} hostAndRamList after running script
 */
export function predictInfoAfterRunScript(script, threads, hostAndRamList) {
    var threadsLeftToRun = threads

    var hostAndRamListAfterRun = hostAndRamList.map((hostAndRam) => {
        if (threadsLeftToRun <= 0) return hostAndRam

        var threadsAbleToRun = Math.floor(hostAndRam.ram / script.ram)
        var threadsRunning = Math.min(threadsLeftToRun, threadsAbleToRun)

        var serverRamAfterRun = hostAndRam.ram - script.ram * threadsRunning

        threadsLeftToRun -= threadsRunning

        return {
            host: hostAndRam.host,
            ram: serverRamAfterRun,
        }
    })

    return { hostAndRamList: hostAndRamListAfterRun, threadsLeftToRun: threadsLeftToRun }
}

/**
 * @param {NS} ns
 * @param {string} targetHost
 * @param {{ name: string; ram: number; }} script
 * @param {number} threads
 * @param {{ host: string; ram: number; }[]} hostAndRamList
 * @param {number} [delayBeforeExec=0] in ms
 *
 * @return {{ host: string; ram: number; }[]} currentHostAndRamList
 */
export function runScript(ns, targetHost, script, threads, hostAndRamList, delayBeforeExec = 0) {
    var threadsLeftToRun = threads

    for (var hostAndRam of hostAndRamList) {
        if (threadsLeftToRun <= 0) break

        var threadsAbleToRun = Math.floor(hostAndRam.ram / script.ram)
        var threadsRunning = Math.min(threadsLeftToRun, threadsAbleToRun)

        if (threadsRunning <= 0) continue

        ns.exec(script.name, hostAndRam.host, threadsRunning, targetHost, delayBeforeExec)
        threadsLeftToRun -= threadsRunning
    }

    var currentHostAndRamList = hostAndRamList.map((hostAndRam) => {
        var currentRam = ns.getServerMaxRam(hostAndRam.host) - ns.getServerUsedRam(hostAndRam.host)

        return {
            host: hostAndRam.host,
            ram: currentRam,
        }
    })

    return currentHostAndRamList
}

/** @param {NS} ns */
export function hackThreadsBinarySearchHWGW(
    ns,
    host,
    hackThread,
    hostAndRamList,
    percentHacked,
    growthLog,
    weakenEffect
) {
    const serverMaxMoney = ns.getServerMaxMoney(host)

    var upperHackThread = hackThread
    var lowerHackThread = 1

    while (upperHackThread != lowerHackThread) {
        const testHackThread = Math.round((upperHackThread + lowerHackThread) / 2)
        const hackSecurity = HackSecurity * testHackThread
        const hackMoney = serverMaxMoney * percentHacked * testHackThread

        const weaken1Thread = calculateWeakenThreads(hackSecurity, weakenEffect)

        const growThread = calculateGrowThreads(
            serverMaxMoney - hackMoney,
            serverMaxMoney,
            growthLog
        )
        const growSecurity = GrowSecurity * growThread

        const weaken2Thread = calculateWeakenThreads(growSecurity, weakenEffect)

        const testInfoAfterHack = predictInfoAfterRunScript(
            HackScript,
            testHackThread,
            hostAndRamList
        )
        const testInfoAfterWeaken1 = predictInfoAfterRunScript(
            WeakenScript,
            weaken1Thread,
            testInfoAfterHack.hostAndRamList
        )
        const testInfoAfterGrow = predictInfoAfterRunScript(
            GrowScript,
            growThread,
            testInfoAfterWeaken1.hostAndRamList
        )
        const testInfoAfterWeaken2 = predictInfoAfterRunScript(
            WeakenScript,
            weaken2Thread,
            testInfoAfterGrow.hostAndRamList
        )

        if (testInfoAfterWeaken2.threadsLeftToRun > 0) {
            if (upperHackThread - lowerHackThread == 1) return lowerHackThread
            upperHackThread = testHackThread
        } else {
            lowerHackThread = testHackThread
        }
    }

    return upperHackThread
}

/** @param {NS} ns */
export function growThreadsBinarySearchGW(growThread, hostAndRamList, weakenEffect) {
    var upperGrowThread = growThread
    var lowerGrowThread = 1

    while (upperGrowThread != lowerGrowThread) {
        const testGrowThread = Math.round((upperGrowThread + lowerGrowThread) / 2)
        const growSecurity = GrowSecurity * testGrowThread

        const weakenThread = calculateWeakenThreads(growSecurity, weakenEffect)

        const testInfoAfterGrow = predictInfoAfterRunScript(
            GrowScript,
            testGrowThread,
            hostAndRamList
        )
        const testInfoAfterWeaken = predictInfoAfterRunScript(
            WeakenScript,
            weakenThread,
            testInfoAfterGrow.hostAndRamList
        )

        if (testInfoAfterWeaken.threadsLeftToRun > 0) {
            if (upperGrowThread - lowerGrowThread == 1) return lowerGrowThread
            upperGrowThread = testGrowThread
        } else {
            lowerGrowThread = testGrowThread
        }
    }

    return upperGrowThread
}
