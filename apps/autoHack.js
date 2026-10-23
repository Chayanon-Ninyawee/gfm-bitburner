import { getUsableHostAndRamList, buyAndUpgradeOwnedServer } from '/gfm/utils/utils.js'
import {
    HackSecurity,
    GrowSecurity,
    calculateHackTime,
    calculateGrowTime,
    calculateWeakenTime,
    calculatePercentHacked,
    calculateHackThreads,
    calculateGrowthLog,
    calculateGrowThreads,
    calculateWeakenEffect,
    calculateWeakenThreads,
    HackScript,
    GrowScript,
    WeakenScript,
    spreadScripts,
    predictInfoAfterRunScript,
    runScript,
    hackThreadsBinarySearchHWGW,
    growThreadsBinarySearchGW,
} from '/gfm/utils/hackUtils.js'

// const TargetHost = "n00dles";
// const TargetHost = "foodnstuff";
// const TargetHost = "harakiri-sushi";
// const TargetHost = "max-hardware";
// const TargetHost = "silver-helix";
const TargetHost = 'millenium-fitness'
var TargetHackMoney = 0

const TimeBetweenThreads = 10

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog('ALL')
    ns.enableLog('print')

    TargetHackMoney = ns.getServerMaxMoney(TargetHost) * 0.5

    buyAndUpgradeOwnedServer(ns)
    var usableHostAndRamList = getUsableHostAndRamList(ns)

    if (!ns.hasRootAccess(TargetHost)) {
        ns.tprint('Target host not rooted.')
        return
    }

    spreadScripts(ns, usableHostAndRamList)

    await setUpTargetServer(ns, usableHostAndRamList)

    const serverMinSecurity = ns.getServerMinSecurityLevel(TargetHost)
    const serverMaxMoney = ns.getServerMaxMoney(TargetHost)

    const percentHacked = calculatePercentHacked(
        ns,
        TargetHost,
        serverMinSecurity,
        ns.getPlayer().skills.hacking, // TODO: Calculate this in a loop and use the predicted hacking level and keep track of player hacking exp NOT LEVEL
        ns.getPlayer().mults.hacking_money
    )
    const growthLog = calculateGrowthLog(
        ns,
        TargetHost,
        serverMinSecurity,
        ns.getPlayer().mults.hacking_grow
    )
    const weakenEffect = calculateWeakenEffect()

    const initHackingTime = calculateHackTime(
        ns,
        TargetHost,
        serverMinSecurity,
        ns.getPlayer().skills.hacking,
        ns.getPlayer().skills.intelligence,
        ns.getPlayer().mults.hacking_speed
    )
    const initGrowingTime = calculateGrowTime(initHackingTime)
    const initWeakeningTime = calculateWeakenTime(initHackingTime)

    var nextTime = Date.now()
    while (true) {
        buyAndUpgradeOwnedServer(ns)

        usableHostAndRamList = getUsableHostAndRamList(ns)
        const currentHostAndRamList = usableHostAndRamList
        // const currentHostAndRamList = usableHostAndRamList.map((hostAndRam) => {
        //   if (hostAndRam.host == "home") {
        //     var currentRam = hostAndRam.ram - ns.getServerUsedRam(hostAndRam.host);
        //
        //     return {
        //       host: hostAndRam.host,
        //       ram: currentRam
        //     };
        //   } else {
        //     return {
        //       host: hostAndRam.host,
        //       ram: hostAndRam.ram
        //     }
        //   }
        // });

        var hackingTime = calculateHackTime(
            ns,
            TargetHost,
            serverMinSecurity,
            ns.getPlayer().skills.hacking,
            ns.getPlayer().skills.intelligence,
            ns.getPlayer().mults.hacking_speed
        )
        var growingTime = calculateGrowTime(hackingTime)
        var weakeningTime = calculateWeakenTime(hackingTime)

        const hackThread = calculateHackThreads(
            serverMaxMoney,
            TargetHackMoney * 1.15,
            percentHacked
        )
        const hackSecurity = HackSecurity * hackThread
        const weaken1Thread = calculateWeakenThreads(hackSecurity, weakenEffect)
        const growThread = calculateGrowThreads(TargetHackMoney, serverMaxMoney, growthLog)
        const growSecurity = GrowSecurity * growThread
        const weaken2Thread = calculateWeakenThreads(growSecurity, weakenEffect)

        // Calculate the additional delay so that the weakening time can be written as (TimeBetweenThreads*5*n + TimeBetweenThreads)
        // const cyclePeriod = TimeBetweenThreads * 15;
        // const targetOffset = TimeBetweenThreads * 2;
        const cyclePeriod = TimeBetweenThreads * 5
        const targetOffset = TimeBetweenThreads * 1
        const alignDelay =
            (targetOffset - (initWeakeningTime % cyclePeriod) + cyclePeriod) % cyclePeriod

        // TODO: Change this so that it changes the time every 5-10 hacking level
        var additionalDelay = initWeakeningTime - weakeningTime + alignDelay

        const maxBatchAmount = Math.ceil(
            (additionalDelay + weakeningTime + cyclePeriod) / cyclePeriod
        )

        var wholeBatchAmount = maxBatchAmount
        var testHostAndRamList = currentHostAndRamList
        for (var i = 0; i < maxBatchAmount; i++) {
            const infoAfterHack = predictInfoAfterRunScript(
                HackScript,
                hackThread,
                testHostAndRamList
            )
            const infoAfterWeaken1 = predictInfoAfterRunScript(
                WeakenScript,
                weaken1Thread,
                infoAfterHack.hostAndRamList
            )
            const infoAfterGrow = predictInfoAfterRunScript(
                GrowScript,
                growThread,
                infoAfterWeaken1.hostAndRamList
            )
            const infoAfterWeaken2 = predictInfoAfterRunScript(
                WeakenScript,
                weaken2Thread,
                infoAfterGrow.hostAndRamList
            )

            if (infoAfterWeaken2.threadsLeftToRun > 0) {
                wholeBatchAmount = i
                break
            }

            testHostAndRamList = infoAfterWeaken2.hostAndRamList
        }

        var isPartialBatchRequired = wholeBatchAmount < maxBatchAmount
        var partialHackThread
        var partialWeaken1Thread
        var partialGrowThread
        var partialWeaken2Thread
        if (isPartialBatchRequired) {
            partialHackThread = hackThreadsBinarySearchHWGW(
                ns,
                TargetHost,
                hackThread,
                testHostAndRamList,
                percentHacked,
                growthLog,
                weakenEffect
            )
            const partialHackSecurity = HackSecurity * partialHackThread
            const partialHackMoney = percentHacked * serverMaxMoney * partialHackThread

            partialWeaken1Thread = calculateWeakenThreads(partialHackSecurity, weakenEffect)

            partialGrowThread = calculateGrowThreads(
                serverMaxMoney - partialHackMoney,
                serverMaxMoney,
                growthLog
            )
            const partialGrowSecurity = GrowSecurity * partialGrowThread

            partialWeaken2Thread = calculateWeakenThreads(partialGrowSecurity, weakenEffect)

            const partialInfoAfterHack = predictInfoAfterRunScript(
                HackScript,
                partialHackThread,
                testHostAndRamList
            )
            const partialInfoAfterWeaken1 = predictInfoAfterRunScript(
                WeakenScript,
                partialWeaken1Thread,
                partialInfoAfterHack.hostAndRamList
            )
            const partialInfoAfterGrow = predictInfoAfterRunScript(
                GrowScript,
                partialGrowThread,
                partialInfoAfterWeaken1.hostAndRamList
            )
            const partialInfoAfterWeaken2 = predictInfoAfterRunScript(
                WeakenScript,
                partialWeaken2Thread,
                partialInfoAfterGrow.hostAndRamList
            )

            if (partialInfoAfterWeaken2.threadsLeftToRun > 0) {
                ns.print('Partial batch binary search error')

                ns.print('maxBatchAmount: ' + maxBatchAmount)
                ns.print('wholeBatchAmount: ' + wholeBatchAmount)
                ns.print('hackThread: ' + hackThread)
                ns.print('weaken1Thread: ' + weaken1Thread)
                ns.print('growThread: ' + growThread)
                ns.print('weaken2Thread: ' + weaken2Thread)

                ns.print('partialHackThread: ' + partialHackThread)
                ns.print('partialWeaken1Thread: ' + partialWeaken1Thread)
                ns.print('partialGrowThread: ' + partialGrowThread)
                ns.print('partialWeaken2Thread: ' + partialWeaken2Thread)

                isPartialBatchRequired = false
                // break;
            }
        }

        ns.print('--- HWGW ---')

        ns.print('maxBatchAmount: ' + maxBatchAmount)
        ns.print('wholeBatchAmount: ' + wholeBatchAmount)
        ns.print('hackThread: ' + hackThread)
        ns.print('weaken1Thread: ' + weaken1Thread)
        ns.print('growThread: ' + growThread)
        ns.print('weaken2Thread: ' + weaken2Thread)

        var wholeBatchHostAndRamList = currentHostAndRamList

        for (var i = 0; i < wholeBatchAmount; i++) {
            nextTime += cyclePeriod

            const now = Date.now()
            const sleepTime = nextTime - now

            // TODO: make this fix better
            hackingTime = calculateHackTime(
                ns,
                TargetHost,
                serverMinSecurity,
                ns.getPlayer().skills.hacking,
                ns.getPlayer().skills.intelligence,
                ns.getPlayer().mults.hacking_speed
            )
            growingTime = calculateGrowTime(hackingTime)
            weakeningTime = calculateWeakenTime(hackingTime)

            const actualWT = ns.getWeakenTime(TargetHost)
            if (actualWT != weakeningTime) {
                ns.print('Error: weakenTime actual != calculated')
                ns.print('Actual - Calculated: ', actualWT - weakeningTime)
            }

            const hostAndRamListAfterHack = runScript(
                ns,
                TargetHost,
                HackScript,
                hackThread,
                wholeBatchHostAndRamList,
                alignDelay + (initWeakeningTime - hackingTime) + TimeBetweenThreads * 0
            )
            const hostAndRamListAfterWeaken1 = runScript(
                ns,
                TargetHost,
                WeakenScript,
                weaken1Thread,
                hostAndRamListAfterHack,
                alignDelay + (initWeakeningTime - weakeningTime) + TimeBetweenThreads * 1
            )
            const hostAndRamListAfterGrow = runScript(
                ns,
                TargetHost,
                GrowScript,
                growThread,
                hostAndRamListAfterWeaken1,
                alignDelay + (initWeakeningTime - growingTime) + TimeBetweenThreads * 2
            )
            const hostAndRamListAfterWeaken2 = runScript(
                ns,
                TargetHost,
                WeakenScript,
                weaken2Thread,
                hostAndRamListAfterGrow,
                alignDelay + (initWeakeningTime - weakeningTime) + TimeBetweenThreads * 3
            )

            wholeBatchHostAndRamList = hostAndRamListAfterWeaken2

            if (sleepTime > 0) {
                await ns.sleep(sleepTime - 5)
            }
            while (ns.getServerSecurityLevel(TargetHost) != serverMinSecurity) {
                await ns.sleep(1)
            }
        }

        if (isPartialBatchRequired) {
            nextTime += cyclePeriod * (maxBatchAmount - wholeBatchAmount)

            const now = Date.now()
            const sleepTime = nextTime - now

            ns.print('partialHackThread: ' + partialHackThread)
            ns.print('partialWeaken1Thread: ' + partialWeaken1Thread)
            ns.print('partialGrowThread: ' + partialGrowThread)
            ns.print('partialWeaken2Thread: ' + partialWeaken2Thread)

            const hostAndRamListAfterHack = runScript(
                ns,
                TargetHost,
                HackScript,
                partialHackThread,
                wholeBatchHostAndRamList,
                additionalDelay + weakeningTime - hackingTime + TimeBetweenThreads * 0
            )
            const hostAndRamListAfterWeaken1 = runScript(
                ns,
                TargetHost,
                WeakenScript,
                partialWeaken1Thread,
                hostAndRamListAfterHack,
                additionalDelay + 0 + TimeBetweenThreads * 1
            )
            const hostAndRamListAfterGrow = runScript(
                ns,
                TargetHost,
                GrowScript,
                partialGrowThread,
                hostAndRamListAfterWeaken1,
                additionalDelay + weakeningTime - growingTime + TimeBetweenThreads * 2
            )
            const hostAndRamListAfterWeaken2 = runScript(
                ns,
                TargetHost,
                WeakenScript,
                partialWeaken2Thread,
                hostAndRamListAfterGrow,
                additionalDelay + 0 + TimeBetweenThreads * 3
            )

            if (sleepTime > 0) {
                await ns.sleep(sleepTime - 5)
            }
            while (ns.getServerSecurityLevel(TargetHost) != serverMinSecurity) {
                await ns.sleep(1)
            }
        }
    }

    await ns.sleep(10000)
}

/** @param {NS} ns */
async function setUpTargetServer(ns, usableHostAndRamList) {
    const serverMinSecurity = ns.getServerMinSecurityLevel(TargetHost)
    const serverMaxMoney = ns.getServerMaxMoney(TargetHost)

    const growthLog = calculateGrowthLog(
        ns,
        TargetHost,
        serverMinSecurity,
        ns.getPlayer().mults.hacking_grow
    )
    const weakenEffect = calculateWeakenEffect()

    while (true) {
        const serverSecurity = ns.getServerSecurityLevel(TargetHost)
        const serverMoney = ns.getServerMoneyAvailable(TargetHost)

        const hackingTime = calculateHackTime(
            ns,
            TargetHost,
            serverSecurity,
            ns.getPlayer().skills.hacking,
            ns.getPlayer().skills.intelligence,
            ns.getPlayer().mults.hacking_speed
        )
        const growingTime = calculateGrowTime(hackingTime)
        const weakeningTime = calculateWeakenTime(hackingTime)

        const weaken1Thread = calculateWeakenThreads(
            serverSecurity - serverMinSecurity,
            weakenEffect
        )
        const growThread = calculateGrowThreads(serverMoney, serverMaxMoney, growthLog)
        const growSecurity = GrowSecurity * growThread
        const weaken2Thread = calculateWeakenThreads(growSecurity, weakenEffect)

        const infoAfterWeaken1 = predictInfoAfterRunScript(
            WeakenScript,
            weaken1Thread,
            usableHostAndRamList
        )
        const infoAfterGrow = predictInfoAfterRunScript(
            GrowScript,
            growThread,
            infoAfterWeaken1.hostAndRamList
        )
        const infoAfterWeaken2 = predictInfoAfterRunScript(
            WeakenScript,
            weaken2Thread,
            infoAfterGrow.hostAndRamList
        )

        if (infoAfterWeaken1.threadsLeftToRun > 0) {
            ns.print('--- 1 ---')
            ns.print('weakenThread: ' + weaken1Thread)
            runScript(
                ns,
                TargetHost,
                WeakenScript,
                weaken1Thread - infoAfterWeaken1.threadsLeftToRun,
                usableHostAndRamList
            )
            if (weaken1Thread != 0)
                // TODO: Why? Remove this
                await ns.sleep(weakeningTime + 200)
            continue
        }

        if (infoAfterWeaken2.threadsLeftToRun > 0) {
            ns.print('--- 2 ---')

            const newGrowThread = growThreadsBinarySearchGW(
                growThread,
                infoAfterWeaken1.hostAndRamList,
                weakenEffect
            )
            const newGrowSecurity = GrowSecurity * newGrowThread

            const newWeaken2Thread = calculateWeakenThreads(newGrowSecurity, weakenEffect)

            const newInfoAfterGrow = predictInfoAfterRunScript(
                GrowScript,
                newGrowThread,
                infoAfterWeaken1.hostAndRamList
            )
            const newInfoAfterWeaken2 = predictInfoAfterRunScript(
                WeakenScript,
                newWeaken2Thread,
                newInfoAfterGrow.hostAndRamList
            )

            if (newInfoAfterWeaken2.threadsLeftToRun > 0) throw new Error('Binary Search Error!')
            ns.print('weaken1Thread: ' + weaken1Thread)
            ns.print('growThread: ' + newGrowThread)
            ns.print('weaken2Thread: ' + newWeaken2Thread)

            const hostAndRamListAfterWeaken1 = runScript(
                ns,
                TargetHost,
                WeakenScript,
                weaken1Thread,
                usableHostAndRamList,
                0 + TimeBetweenThreads * 0
            )
            const hostAndRamListAfterGrow = runScript(
                ns,
                TargetHost,
                GrowScript,
                newGrowThread,
                hostAndRamListAfterWeaken1,
                weakeningTime - growingTime + TimeBetweenThreads * 1
            )
            const hostAndRamListAfterWeaken2 = runScript(
                ns,
                TargetHost,
                WeakenScript,
                newWeaken2Thread,
                hostAndRamListAfterGrow,
                0 + TimeBetweenThreads * 2
            )

            if (weaken1Thread != 0 || newGrowThread != 0 || newWeaken2Thread != 0)
                // TODO: Why? Remove this
                await ns.sleep(weakeningTime + TimeBetweenThreads * 2 + 200)
            continue
        }

        ns.print('--- 3 ---')

        ns.print('weaken1Thread: ' + weaken1Thread)
        ns.print('growThread: ' + growThread)
        ns.print('weaken2Thread: ' + weaken2Thread)

        const hostAndRamListAfterWeaken1 = runScript(
            ns,
            TargetHost,
            WeakenScript,
            weaken1Thread,
            usableHostAndRamList,
            0 + TimeBetweenThreads * 0
        )
        const hostAndRamListAfterGrow = runScript(
            ns,
            TargetHost,
            GrowScript,
            growThread,
            hostAndRamListAfterWeaken1,
            weakeningTime - growingTime + TimeBetweenThreads * 1
        )
        const hostAndRamListAfterWeaken2 = runScript(
            ns,
            TargetHost,
            WeakenScript,
            weaken2Thread,
            hostAndRamListAfterGrow,
            0 + TimeBetweenThreads * 2
        )

        if (weaken1Thread != 0 || growThread != 0 || weaken2Thread != 0)
            // TODO: Why? Remove this
            await ns.sleep(weakeningTime + TimeBetweenThreads * 2 + 200)

        break
    }
}
