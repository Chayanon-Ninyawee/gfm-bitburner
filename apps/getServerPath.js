const findPath = (ns, target, serverName, serverList, ignore, isFound) => {
    ignore.push(serverName)
    let scanResults = ns.scan(serverName)
    for (let server of scanResults) {
        if (ignore.includes(server)) {
            continue
        }
        if (server === target) {
            serverList.push(server)
            return [serverList, true]
        }
        serverList.push(server)
        ;[serverList, isFound] = findPath(ns, target, server, serverList, ignore, isFound)
        if (isFound) {
            return [serverList, isFound]
        }
        serverList.pop()
    }
    return [serverList, false]
}

/** @param {NS} ns **/
export async function main(ns) {
    let startServer = ns.getHostname()
    let target = ns.args[0]
    if (target === undefined) {
        ns.tprint('Please provide target server')
        return
    }
    let [results, isFound] = findPath(ns, target, startServer, [], [], false)
    if (!isFound) {
        ns.tprint('Server not found!')
    } else {
        ns.tprint(results.join(' --> '))
    }
}
