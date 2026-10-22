/** @param {NS} ns */
export async function main(ns) {
    const DEFAULT_OPPONENT = 'Daedalus'
    const DEFAULT_BOARD_SIZE = 13

    const ROOT_CANDIDATES = 20
    const SEARCH_BRANCH = 10
    const SEARCH_DEPTH = 3
    const MOVE_DELAY = 1
    const CACHE_LIMIT = 12000

    const PASS_LEAD = 0.5

    const BLACK = 'X'
    const WHITE = 'O'
    const EMPTY = '.'
    const OFFLINE = '#'

    const DIRECTIONS = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ]

    const opponent = String(ns.args[0] ?? DEFAULT_OPPONENT)
    const boardSize = Number(ns.args[1] ?? DEFAULT_BOARD_SIZE)

    if (![5, 7, 9, 13].includes(boardSize)) {
        ns.tprint('Invalid board size. Use 5, 7, 9, or 13.')
        return
    }

    let groupCache = new Map()
    let evaluationCache = new Map()

    function clearCaches() {
        groupCache.clear()
        evaluationCache.clear()
    }

    function cloneBoard(board) {
        return board.map((column) => (typeof column === 'string' ? [...column] : column.slice()))
    }

    function boardKey(board) {
        return board
            .map((column) => (typeof column === 'string' ? column : column.join('')))
            .join('|')
    }

    function inBounds(board, x, y) {
        return x >= 0 && y >= 0 && x < board.length && y < board[x].length
    }

    function getGroup(board, startX, startY) {
        const color = board[startX][startY]
        const stones = []
        const liberties = new Set()
        const visited = new Set()
        const stack = [[startX, startY]]

        while (stack.length > 0) {
            const [x, y] = stack.pop()
            const position = y * board.length + x

            if (visited.has(position)) continue

            visited.add(position)
            stones.push([x, y])

            for (const [dx, dy] of DIRECTIONS) {
                const nx = x + dx
                const ny = y + dy

                if (!inBounds(board, nx, ny)) continue

                const cell = board[nx][ny]
                const neighborPosition = ny * board.length + nx

                if (cell === EMPTY) {
                    liberties.add(neighborPosition)
                } else if (cell === color && !visited.has(neighborPosition)) {
                    stack.push([nx, ny])
                }
            }
        }

        return { color, stones, liberties }
    }

    function getGroups(board, color = null) {
        const key = `${color ?? '*'}:${boardKey(board)}`
        const cached = groupCache.get(key)

        if (cached !== undefined) return cached

        const groups = []
        const visited = new Set()

        for (let x = 0; x < board.length; x++) {
            for (let y = 0; y < board[x].length; y++) {
                const cell = board[x][y]

                if (cell === EMPTY || cell === OFFLINE || (color !== null && cell !== color)) {
                    continue
                }

                const position = y * board.length + x

                if (visited.has(position)) continue

                const group = getGroup(board, x, y)
                groups.push(group)

                for (const [sx, sy] of group.stones) {
                    visited.add(sy * board.length + sx)
                }
            }
        }

        if (groupCache.size >= CACHE_LIMIT) {
            groupCache.clear()
        }

        groupCache.set(key, groups)
        return groups
    }

    function simulateMove(board, x, y, color, previousBoard = null) {
        if (!inBounds(board, x, y) || board[x][y] !== EMPTY) {
            return null
        }

        const next = cloneBoard(board)
        const enemy = color === BLACK ? WHITE : BLACK

        next[x][y] = color

        let captured = 0
        const checked = new Set()

        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx
            const ny = y + dy

            if (!inBounds(next, nx, ny) || next[nx][ny] !== enemy) {
                continue
            }

            const position = ny * next.length + nx

            if (checked.has(position)) continue

            const group = getGroup(next, nx, ny)

            for (const [sx, sy] of group.stones) {
                checked.add(sy * next.length + sx)
            }

            if (group.liberties.size === 0) {
                for (const [sx, sy] of group.stones) {
                    next[sx][sy] = EMPTY
                    captured++
                }
            }
        }

        const ownGroup = getGroup(next, x, y)

        // Suicide is illegal.
        if (ownGroup.liberties.size === 0) {
            return null
        }

        // Simple ko check.
        if (previousBoard !== null && boardKey(next) === boardKey(previousBoard)) {
            return null
        }

        return {
            board: next,
            captured,
            ownGroup,
        }
    }

    function countEmpty(board) {
        let count = 0

        for (const column of board) {
            for (const cell of column) {
                if (cell === EMPTY) count++
            }
        }

        return count
    }

    function countAdjacent(board, x, y, color) {
        let count = 0

        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx
            const ny = y + dy

            if (inBounds(board, nx, ny) && board[nx][ny] === color) {
                count++
            }
        }

        return count
    }

    function isOwnEye(board, x, y, color) {
        let neighbors = 0

        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx
            const ny = y + dy

            if (!inBounds(board, nx, ny)) continue

            neighbors++

            const cell = board[nx][ny]

            if (cell !== color && cell !== OFFLINE) {
                return false
            }
        }

        return neighbors > 0
    }

    function getRegion(board, startX, startY, visited) {
        const region = []
        const borders = new Set()
        const contacts = {
            [BLACK]: 0,
            [WHITE]: 0,
        }
        const stack = [[startX, startY]]

        while (stack.length > 0) {
            const [x, y] = stack.pop()
            const position = y * board.length + x

            if (visited.has(position)) continue

            visited.add(position)
            region.push([x, y])

            for (const [dx, dy] of DIRECTIONS) {
                const nx = x + dx
                const ny = y + dy

                if (!inBounds(board, nx, ny)) continue

                const cell = board[nx][ny]

                if (cell === EMPTY) {
                    const neighborPosition = ny * board.length + nx

                    if (!visited.has(neighborPosition)) {
                        stack.push([nx, ny])
                    }
                } else if (cell === BLACK || cell === WHITE) {
                    borders.add(cell)
                    contacts[cell]++
                }
            }
        }

        return {
            region,
            borders,
            contacts,
        }
    }

    function evaluateBoard(board) {
        const key = boardKey(board)
        const cached = evaluationCache.get(key)

        if (cached !== undefined) return cached

        let score = 0

        // Score stones directly.
        for (let x = 0; x < board.length; x++) {
            for (let y = 0; y < board[x].length; y++) {
                if (board[x][y] === BLACK) score++
                else if (board[x][y] === WHITE) score--
            }
        }

        // Estimate territory.
        const visited = new Set()

        for (let x = 0; x < board.length; x++) {
            for (let y = 0; y < board[x].length; y++) {
                if (board[x][y] !== EMPTY) continue

                const position = y * board.length + x

                if (visited.has(position)) continue

                const { region, borders, contacts } = getRegion(board, x, y, visited)

                if (borders.size === 1) {
                    const owner = borders.has(BLACK) ? BLACK : WHITE
                    const sign = owner === BLACK ? 1 : -1

                    const totalContacts = contacts[BLACK] + contacts[WHITE]

                    const confidence = Math.min(
                        1,
                        totalContacts / Math.max(4, region.length * 0.35)
                    )

                    score += sign * region.length * (0.65 + 0.35 * confidence)
                } else if (borders.size === 2) {
                    const influence = contacts[BLACK] - contacts[WHITE]

                    score +=
                        Math.sign(influence) *
                        Math.min(region.length * 0.15, Math.abs(influence) * 0.25)
                }
            }
        }

        // Penalize vulnerable groups.
        for (const group of getGroups(board)) {
            const sign = group.color === BLACK ? 1 : -1
            const size = group.stones.length
            const liberties = group.liberties.size

            if (liberties === 1) {
                score -= sign * size * 6
            } else if (liberties === 2) {
                score -= sign * size * 2
            } else if (liberties === 3) {
                score -= sign * size * 0.5
            }
        }

        if (evaluationCache.size >= CACHE_LIMIT) {
            evaluationCache.clear()
        }

        evaluationCache.set(key, score)
        return score
    }

    function hasUrgentGroup(board, color) {
        return getGroups(board, color).some((group) => {
            return (
                group.liberties.size === 1 ||
                (group.stones.length >= 3 && group.liberties.size === 2)
            )
        })
    }

    function hasEnemyInAtari(board, color) {
        const enemy = color === BLACK ? WHITE : BLACK

        return getGroups(board, enemy).some((group) => group.liberties.size === 1)
    }

    function movePriority(board, x, y, color, previousBoard = null) {
        const result = simulateMove(board, x, y, color, previousBoard)

        if (result === null) return null

        const enemy = color === BLACK ? WHITE : BLACK
        const ownGroup = result.ownGroup

        let priority = 0

        // Reward captures.
        priority += result.captured * 40

        priority += Math.min(ownGroup.liberties.size, 6) * 2
        priority += Math.min(ownGroup.stones.length, 8) * 0.3

        // Penalize own-eye moves.
        if (result.captured === 0 && isOwnEye(board, x, y, color)) {
            priority -= 12
        }

        // Discourage moves that leave our group in atari.
        if (ownGroup.liberties.size === 1 && result.captured === 0) {
            priority -= 12 + ownGroup.stones.length * 8
        } else if (ownGroup.liberties.size === 2) {
            priority -= ownGroup.stones.length * 1.5
        }

        // Reward saving adjacent friendly groups.
        const seenOwn = new Set()

        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx
            const ny = y + dy

            if (!inBounds(board, nx, ny) || board[nx][ny] !== color) {
                continue
            }

            const position = ny * board.length + nx

            if (seenOwn.has(position)) continue

            const group = getGroup(board, nx, ny)

            for (const [sx, sy] of group.stones) {
                seenOwn.add(sy * board.length + sx)
            }

            if (group.liberties.size <= 2) {
                const saved = getGroup(result.board, nx, ny)

                if (saved.liberties.size > group.liberties.size) {
                    priority += saved.stones.length * (group.liberties.size === 1 ? 22 : 8)
                }
            }
        }

        // Reward attacking adjacent enemy groups.
        const seenEnemy = new Set()

        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx
            const ny = y + dy

            if (!inBounds(board, nx, ny) || board[nx][ny] !== enemy) {
                continue
            }

            const position = ny * board.length + nx

            if (seenEnemy.has(position)) continue

            const group = getGroup(board, nx, ny)

            for (const [sx, sy] of group.stones) {
                seenEnemy.add(sy * board.length + sx)
            }

            // The enemy group might have been captured by this move.
            // Do not call getGroup() on an empty intersection.
            if (result.board[nx][ny] !== enemy) {
                continue
            }

            const after = getGroup(result.board, nx, ny)

            if (after.liberties.size < group.liberties.size) {
                priority += group.stones.length * (after.liberties.size === 1 ? 10 : 3)
            }
        }

        const adjacentOwn = countAdjacent(board, x, y, color)
        const adjacentEnemy = countAdjacent(board, x, y, enemy)

        priority += adjacentOwn * 1.5

        if (adjacentOwn >= 2 && adjacentEnemy === 0 && result.captured === 0) {
            priority -= 4
        }

        // Prefer a reasonable opening line.
        const edgeDistance = Math.min(x, y, board.length - 1 - x, board[x].length - 1 - y)

        const targetLine = board.length <= 7 ? 1 : board.length <= 9 ? 2 : 3

        priority += 2 - Math.abs(edgeDistance - targetLine)

        // Use evaluation as a smaller positional adjustment in the endgame.
        if (countEmpty(board) <= 65) {
            const scoreChange = evaluateBoard(result.board) - evaluateBoard(board)

            priority += (color === BLACK ? scoreChange : -scoreChange) * 0.5
        }

        return {
            x,
            y,
            board: result.board,
            captured: result.captured,
            priority,
        }
    }

    function generateMoves(board, color, limit, previousBoard = null) {
        const moves = []

        for (let x = 0; x < board.length; x++) {
            for (let y = 0; y < board[x].length; y++) {
                if (board[x][y] !== EMPTY) continue

                const move = movePriority(board, x, y, color, previousBoard)

                if (move !== null) {
                    moves.push(move)
                }
            }
        }

        moves.sort((a, b) => b.priority - a.priority)

        return moves.slice(0, limit)
    }

    function tacticalSearch(
        board,
        color,
        depth,
        alpha,
        beta,
        previousBoard,
        path,
        consecutivePasses = 0
    ) {
        if (depth <= 0) {
            return evaluateBoard(board)
        }

        const key = `${color}:${consecutivePasses}:${boardKey(board)}`

        if (path.has(key)) {
            return evaluateBoard(board)
        }

        path.add(key)

        const moves = generateMoves(board, color, SEARCH_BRANCH, previousBoard)

        const maximizing = color === BLACK
        const nextColor = maximizing ? WHITE : BLACK

        let best = maximizing ? -Infinity : Infinity

        // Search actual moves first.
        for (const move of moves) {
            const value = tacticalSearch(
                move.board,
                nextColor,
                depth - 1,
                alpha,
                beta,
                board,
                path,
                0
            )

            if (maximizing) {
                best = Math.max(best, value)
                alpha = Math.max(alpha, best)
            } else {
                best = Math.min(best, value)
                beta = Math.min(beta, best)
            }

            if (beta <= alpha) break
        }

        // Passing is also a legal option in Go.
        // Two consecutive passes end the game.
        if (beta > alpha) {
            const passValue =
                consecutivePasses >= 1
                    ? evaluateBoard(board)
                    : tacticalSearch(board, nextColor, depth - 1, alpha, beta, null, path, 1)

            if (maximizing) {
                best = Math.max(best, passValue)
            } else {
                best = Math.min(best, passValue)
            }
        }

        path.delete(key)

        return best
    }

    function chooseMove(board, validMoves) {
        const candidates = []

        for (let x = 0; x < board.length; x++) {
            for (let y = 0; y < board[x].length; y++) {
                if (!validMoves[x]?.[y]) continue

                const move = movePriority(board, x, y, BLACK)

                if (move !== null) {
                    candidates.push(move)
                }
            }
        }

        candidates.sort((a, b) => b.priority - a.priority)

        const currentScore = evaluateBoard(board)

        let bestMove = null
        let bestScore = -Infinity

        for (const move of candidates.slice(0, ROOT_CANDIDATES)) {
            const score = tacticalSearch(
                move.board,
                WHITE,
                SEARCH_DEPTH - 1,
                -Infinity,
                Infinity,
                board,
                new Set()
            )

            const adjustedScore = score + move.priority * 0.01

            if (adjustedScore > bestScore) {
                bestScore = adjustedScore

                bestMove = {
                    x: move.x,
                    y: move.y,
                    score,
                    priority: move.priority,
                }
            }
        }

        // Reject moves that look significantly worse than the current board.
        if (bestMove !== null && bestMove.score < currentScore - 20) {
            return null
        }

        return bestMove
    }

    function chooseFallbackMove(board, validMoves) {
        let bestMove = null
        let bestScore = -Infinity

        for (let x = 0; x < board.length; x++) {
            for (let y = 0; y < board[x].length; y++) {
                if (!validMoves[x]?.[y]) continue

                const result = simulateMove(board, x, y, BLACK)

                if (result === null) continue

                const replies = generateMoves(result.board, WHITE, 1, board)

                let score

                if (replies.length > 0) {
                    score = tacticalSearch(
                        replies[0].board,
                        BLACK,
                        1,
                        -Infinity,
                        Infinity,
                        result.board,
                        new Set()
                    )
                } else {
                    score = evaluateBoard(result.board)
                }

                score += result.captured * 3

                if (result.ownGroup.liberties.size === 1) {
                    score -= result.ownGroup.stones.length * 12
                }

                if (score > bestScore) {
                    bestScore = score

                    bestMove = {
                        x,
                        y,
                        score,
                        priority: -Infinity,
                    }
                }
            }
        }

        return bestMove
    }

    function shouldPassEndgame(board, state) {
        return state.blackScore - state.whiteScore >= PASS_LEAD
    }

    while (true) {
        ns.print(`Starting ${opponent} game (${boardSize}x${boardSize})`)

        ns.go.resetBoardState(opponent, boardSize)
        clearCaches()

        let opponentPassed = false

        while (true) {
            const state = ns.go.getGameState()

            if (state.currentPlayer === 'None') break

            if (state.currentPlayer !== 'Black') {
                await ns.sleep(10)
                continue
            }

            const board = ns.go.getBoardState()

            if (opponentPassed && shouldPassEndgame(board, state)) {
                ns.print(
                    `Passing to end game. Black: ${state.blackScore}, White: ${state.whiteScore}`
                )

                const result = await ns.go.passTurn(false)

                if (result.type === 'gameOver') break

                opponentPassed = result.type === 'pass'
                continue
            }

            const validMoves = ns.go.analysis.getValidMoves()
            let move = chooseMove(board, validMoves)

            if (opponentPassed && move === null) {
                ns.print(
                    `Passing to end game. Black: ${state.blackScore}, White: ${state.whiteScore}`
                )

                const result = await ns.go.passTurn(false)

                if (result.type === 'gameOver') break

                opponentPassed = result.type === 'pass'
                continue
            }

            if (move === null) {
                const safeToPass =
                    state.blackScore - state.whiteScore >= PASS_LEAD &&
                    !hasUrgentGroup(board, BLACK) &&
                    !hasEnemyInAtari(board, BLACK)

                if (safeToPass) {
                    const result = await ns.go.passTurn(false)

                    if (result.type === 'gameOver') break

                    opponentPassed = result.type === 'pass'
                    continue
                }

                move = chooseFallbackMove(board, validMoves)

                if (move !== null) {
                    ns.print(
                        `WARNING: Fallback move (${move.x}, ${move.y}), score ${move.score.toFixed(2)}`
                    )
                }

                if (move === null) {
                    const result = await ns.go.passTurn(false)

                    if (result.type === 'gameOver') break

                    opponentPassed = result.type === 'pass'
                    continue
                }
            }

            const priorityText = Number.isFinite(move.priority)
                ? move.priority.toFixed(2)
                : 'fallback'

            ns.print(
                `Move (${move.x}, ${move.y}), score ${move.score.toFixed(2)}, priority ${priorityText}`
            )

            const result = await ns.go.makeMove(move.x, move.y, false)

            if (result.type === 'gameOver') break

            opponentPassed = result.type === 'pass'

            await ns.sleep(MOVE_DELAY)
        }

        ns.print('Game ended. Starting the next game.')
    }
}
