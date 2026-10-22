/** @param {NS} ns */
export async function main(ns) {
    const DEFAULT_OPPONENT = 'Daedalus'
    const DEFAULT_BOARD_SIZE = 13

    const ROOT_CANDIDATES = 20
    const SEARCH_BRANCH = 6
    const SEARCH_DEPTH = 3
    const MOVE_DELAY = 1

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

    function cloneBoard(board) {
        return board.map((column) => [...column])
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
            const key = `${x},${y}`

            if (visited.has(key)) continue

            visited.add(key)
            stones.push([x, y])

            for (const [dx, dy] of DIRECTIONS) {
                const nx = x + dx
                const ny = y + dy

                if (!inBounds(board, nx, ny)) continue

                const cell = board[nx][ny]

                if (cell === EMPTY) {
                    liberties.add(`${nx},${ny}`)
                } else if (cell === color && !visited.has(`${nx},${ny}`)) {
                    stack.push([nx, ny])
                }
            }
        }

        return { color, stones, liberties }
    }

    function getGroups(board, color = null) {
        const groups = []
        const visited = new Set()

        for (let x = 0; x < board.length; x++) {
            for (let y = 0; y < board[x].length; y++) {
                const cell = board[x][y]

                if (cell === EMPTY || cell === OFFLINE || (color !== null && cell !== color)) {
                    continue
                }

                const key = `${x},${y}`
                if (visited.has(key)) continue

                const group = getGroup(board, x, y)
                groups.push(group)

                for (const [sx, sy] of group.stones) {
                    visited.add(`${sx},${sy}`)
                }
            }
        }

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

            const key = `${nx},${ny}`
            if (checked.has(key)) continue

            const group = getGroup(next, nx, ny)

            for (const [sx, sy] of group.stones) {
                checked.add(`${sx},${sy}`)
            }

            if (group.liberties.size === 0) {
                for (const [sx, sy] of group.stones) {
                    next[sx][sy] = EMPTY
                    captured++
                }
            }
        }

        const ownGroup = getGroup(next, x, y)

        if (ownGroup.liberties.size === 0) return null

        // Prevent immediate repetition of the previous board position.
        if (previousBoard !== null && boardKey(next) === boardKey(previousBoard)) {
            return null
        }

        return { board: next, captured, ownGroup }
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
        const contacts = { [BLACK]: 0, [WHITE]: 0 }
        const stack = [[startX, startY]]

        while (stack.length > 0) {
            const [x, y] = stack.pop()
            const key = `${x},${y}`

            if (visited.has(key)) continue

            visited.add(key)
            region.push([x, y])

            for (const [dx, dy] of DIRECTIONS) {
                const nx = x + dx
                const ny = y + dy

                if (!inBounds(board, nx, ny)) continue

                const cell = board[nx][ny]

                if (cell === EMPTY) {
                    if (!visited.has(`${nx},${ny}`)) {
                        stack.push([nx, ny])
                    }
                } else if (cell === BLACK || cell === WHITE) {
                    borders.add(cell)
                    contacts[cell]++
                }
            }
        }

        return { region, borders, contacts }
    }

    // Approximate area evaluation. Positive favors Black.
    function evaluateBoard(board) {
        let score = 0

        for (let x = 0; x < board.length; x++) {
            for (let y = 0; y < board[x].length; y++) {
                if (board[x][y] === BLACK) score++
                else if (board[x][y] === WHITE) score--
            }
        }

        const visited = new Set()

        for (let x = 0; x < board.length; x++) {
            for (let y = 0; y < board[x].length; y++) {
                if (board[x][y] !== EMPTY) continue
                if (visited.has(`${x},${y}`)) continue

                const { region, borders, contacts } = getRegion(board, x, y, visited)

                if (borders.size !== 1) continue

                const owner = borders.has(BLACK) ? BLACK : WHITE
                const requiredContacts = Math.max(2, Math.ceil(Math.sqrt(region.length) * 1.25))

                if (contacts[owner] >= requiredContacts) {
                    score += (owner === BLACK ? 1 : -1) * region.length
                }
            }
        }

        for (const group of getGroups(board)) {
            const sign = group.color === BLACK ? 1 : -1
            const size = group.stones.length
            const liberties = group.liberties.size

            if (liberties === 1) {
                score -= sign * size * 8
            } else if (liberties === 2) {
                score -= sign * size * 3
            } else if (liberties === 3) {
                score -= sign * size * 0.5
            }
        }

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

    function movePriority(board, x, y, color, previousBoard = null) {
        const result = simulateMove(board, x, y, color, previousBoard)

        if (result === null) return null

        const enemy = color === BLACK ? WHITE : BLACK

        // Avoid filling our own eye unless it captures stones.
        if (result.captured === 0 && isOwnEye(board, x, y, color)) {
            return null
        }

        // Reject immediate self-atari unless it captures stones.
        if (result.captured === 0 && result.ownGroup.liberties.size === 1) {
            return null
        }

        let priority = result.captured * 35

        priority += Math.min(result.ownGroup.liberties.size, 6) * 2
        priority += Math.min(result.ownGroup.stones.length, 8) * 0.3

        const seenOwn = new Set()

        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx
            const ny = y + dy

            if (!inBounds(board, nx, ny) || board[nx][ny] !== color) {
                continue
            }

            const key = `${nx},${ny}`
            if (seenOwn.has(key)) continue

            const group = getGroup(board, nx, ny)

            for (const [sx, sy] of group.stones) {
                seenOwn.add(`${sx},${sy}`)
            }

            if (group.liberties.size === 1) {
                const saved = getGroup(result.board, nx, ny)

                if (saved.liberties.size > 1) {
                    priority += saved.stones.length * 15
                }
            }
        }

        const seenEnemy = new Set()

        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx
            const ny = y + dy

            if (!inBounds(board, nx, ny) || board[nx][ny] !== enemy) {
                continue
            }

            const key = `${nx},${ny}`
            if (seenEnemy.has(key)) continue

            const group = getGroup(board, nx, ny)

            for (const [sx, sy] of group.stones) {
                seenEnemy.add(`${sx},${sy}`)
            }

            if (group.liberties.size === 2) {
                priority += group.stones.length * 5
            }
        }

        const adjacentOwn = countAdjacent(board, x, y, color)
        const adjacentEnemy = countAdjacent(board, x, y, enemy)

        priority += adjacentOwn * 1.5

        if (adjacentOwn >= 2 && adjacentEnemy === 0 && result.captured === 0) {
            priority -= 4
        }

        const edgeDistance = Math.min(x, y, board.length - 1 - x, board[x].length - 1 - y)

        const targetLine = board.length <= 7 ? 1 : board.length <= 9 ? 2 : 3

        priority += 2 - Math.abs(edgeDistance - targetLine)

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

                if (move !== null) moves.push(move)
            }
        }

        moves.sort((a, b) => b.priority - a.priority)
        return moves.slice(0, limit)
    }

    function tacticalSearch(board, color, depth, alpha, beta, previousBoard, path) {
        if (depth === 0 || countEmpty(board) === 0) {
            return evaluateBoard(board)
        }

        const key = boardKey(board)

        if (path.has(key)) return evaluateBoard(board)

        const moves = generateMoves(board, color, SEARCH_BRANCH, previousBoard)

        if (moves.length === 0) return evaluateBoard(board)

        path.add(key)

        let best = color === BLACK ? -Infinity : Infinity

        for (const move of moves) {
            const value = tacticalSearch(
                move.board,
                color === BLACK ? WHITE : BLACK,
                depth - 1,
                alpha,
                beta,
                board,
                path
            )

            if (color === BLACK) {
                best = Math.max(best, value)
                alpha = Math.max(alpha, best)
            } else {
                best = Math.min(best, value)
                beta = Math.min(beta, best)
            }

            if (beta <= alpha) break
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

                if (move !== null) candidates.push(move)
            }
        }

        candidates.sort((a, b) => b.priority - a.priority)

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

            const adjustedScore = score + move.priority * 0.02

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

                let score = evaluateBoard(result.board)

                score += result.captured * 3
                score += Math.min(result.ownGroup.liberties.size, 5)

                if (result.ownGroup.liberties.size === 1) {
                    score -= result.ownGroup.stones.length * 5
                }

                if (score > bestScore) {
                    bestScore = score
                    bestMove = { x, y, score }
                }
            }
        }

        return bestMove
    }

    function shouldPassEndgame(board, state) {
        const lead = state.blackScore - state.whiteScore
        const emptyCount = countEmpty(board)
        const totalPoints = board.length * board.length

        if (lead < 5) return false

        // Keep playing if Black has a group in immediate danger.
        if (hasUrgentGroup(board, BLACK)) return false

        // Keep playing if a vulnerable White group might still be captured.
        const whiteGroups = getGroups(board, WHITE)
        const enemyInAtari = whiteGroups.some((group) => group.liberties.size === 1)

        if (enemyInAtari) return false

        // Only stop early when most of the board is already occupied.
        return emptyCount <= totalPoints * 0.25
    }

    function shouldPassAfterOpponentPass(board, state) {
        const lead = state.blackScore - state.whiteScore

        return lead > 0 && !hasUrgentGroup(board, BLACK)
    }

    while (true) {
        ns.print(`Starting ${opponent} game (${boardSize}x${boardSize})`)

        ns.go.resetBoardState(opponent, boardSize)

        let opponentPassed = false

        while (true) {
            const state = ns.go.getGameState()

            if (state.currentPlayer === 'None') {
                break
            }

            if (state.currentPlayer !== 'Black') {
                await ns.sleep(10)
                continue
            }

            const board = ns.go.getBoardState()

            // If the opponent passed, finish only when ahead and safe.
            if (opponentPassed && shouldPassAfterOpponentPass(board, state)) {
                ns.print(
                    `Passing to end game. Black: ${state.blackScore}, White: ${state.whiteScore}`
                )

                const result = await ns.go.passTurn(false)

                if (result.type === 'gameOver') {
                    ns.print('Game ended. Starting the next game.')
                    break
                }

                opponentPassed = result.type === 'pass'
                continue
            }

            // Don't keep filling the board if the lead is secure.
            if (shouldPassEndgame(board, state)) {
                ns.print(
                    `Passing in endgame. Black: ${state.blackScore}, White: ${state.whiteScore}`
                )

                const result = await ns.go.passTurn(false)

                if (result.type === 'gameOver') {
                    ns.print('Game ended. Starting the next game.')
                    break
                }

                opponentPassed = result.type === 'pass'
                continue
            }

            const validMoves = ns.go.analysis.getValidMoves()
            let move = chooseMove(board, validMoves)

            if (move === null) {
                const lead = state.blackScore - state.whiteScore
                const safeToPass = lead > 0 && !hasUrgentGroup(board, BLACK)

                if (safeToPass) {
                    ns.print(
                        `No safe moves. Passing while ahead. Black: ${state.blackScore}, White: ${state.whiteScore}`
                    )

                    const result = await ns.go.passTurn(false)

                    if (result.type === 'gameOver') {
                        ns.print('Game ended. Starting the next game.')
                        break
                    }

                    opponentPassed = result.type === 'pass'
                    continue
                }

                move = chooseFallbackMove(board, validMoves)

                if (move === null) {
                    ns.print('No legal moves. Passing.')

                    const result = await ns.go.passTurn(false)

                    if (result.type === 'gameOver') {
                        ns.print('Game ended. Starting the next game.')
                        break
                    }

                    opponentPassed = result.type === 'pass'
                    continue
                }
            }

            ns.print(
                `Move (${move.x}, ${move.y}), score ${move.score.toFixed(2)}, priority ${(move.priority ?? 0).toFixed(2)}`
            )

            const result = await ns.go.makeMove(move.x, move.y, false)

            if (result.type === 'gameOver') {
                ns.print('Game ended. Starting the next game.')
                break
            }

            opponentPassed = result.type === 'pass'

            await ns.sleep(MOVE_DELAY)
        }
    }
}
