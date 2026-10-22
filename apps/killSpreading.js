import { getUsableHostAndRamList } from '/gfm/utils/utils.js'

/** @param {NS} ns */
export async function main(ns) {
    const usableHostAndRamList = getUsableHostAndRamList(ns)

    for (const { host } of usableHostAndRamList) {
        for (const script of ns.ps(host)) {
            if (script.filename.includes('spreadingScript')) {
                ns.kill(script.pid)
                ns.print(`Killed ${script.filename} on ${host}`)
            }
        }
    }
}
