/** @param {NS} ns */
export async function main(ns) {
    const BOARD_SIZE = 13
    const CENTER = 6
    const PLAYER = 'home'
    const OPPONENTS = ['Daedalus']
    const MOVE_DELAY = 200

    const phase3Positions = [
        ['E', 8],
        ['E', 9],
        ['F', 9],
        ['H', 9],
        ['J', 9],
        ['J', 8],
        ['E', 6],
        ['E', 5],
        ['F', 5],
        ['H', 5],
        ['J', 5],
        ['J', 6],
    ]

    const phase4Positions = [
        ['C', 8],
        ['C', 9],
        ['D', 9],
        ['K', 9],
        ['L', 9],
        ['L', 8],
        ['C', 6],
        ['C', 5],
        ['D', 5],
        ['K', 5],
        ['L', 5],
        ['L', 6],
        ['E', 4],
        ['E', 3],
        ['F', 3],
        ['J', 4],
        ['J', 3],
        ['H', 3],
        ['E', 10],
        ['E', 11],
        ['F', 11],
        ['J', 10],
        ['J', 11],
        ['H', 11],
    ]

    const phase5Positions = [
        ['B', 6],
        ['B', 5],
        ['A', 5],
        ['B', 8],
        ['B', 9],
        ['A', 9],
        ['F', 2],
        ['E', 2],
        ['E', 1],
        ['H', 2],
        ['J', 2],
        ['J', 1],
        ['F', 12],
        ['E', 12],
        ['E', 13],
        ['H', 12],
        ['J', 12],
        ['J', 13],
        ['M', 8],
        ['M', 9],
        ['N', 9],
        ['M', 6],
        ['M', 5],
        ['N', 5],
    ]

    const excludedPositions = [
        ['F', 6],
        ['D', 6],
        ['A', 6],
        ['F', 8],
        ['D', 8],
        ['A', 8],
        ['H', 6],
        ['K', 6],
        ['N', 6],
        ['H', 8],
        ['K', 8],
        ['N', 8],
        ['F', 10],
        ['F', 13],
        ['H', 10],
        ['H', 13],
        ['F', 4],
        ['F', 1],
        ['H', 4],
        ['H', 1],
    ]

    // Convert board coordinates such as E8 to [row, column].
    const columns = 'ABCDEFGHJKLMN'

    function toCoordinates([letter, number]) {
        return [number - 1, columns.indexOf(letter)]
    }

    function toCoordinateSet(positions) {
        return new Set(
            positions.map((pos) => {
                const [row, col] = toCoordinates(pos)
                return `${row},${col}`
            })
        )
    }

    const phase3 = phase3Positions.map(toCoordinates)
    const phase4 = phase4Positions.map(toCoordinates)
    const phase5 = phase5Positions.map(toCoordinates)
    const excluded = toCoordinateSet(excludedPositions)

    function randomItem(items) {
        return items.length ? items[Math.floor(Math.random() * items.length)] : null
    }

    function getRandomMove(validMoves, predicate = () => true) {
        const moves = []

        for (let row = 0; row < validMoves.length; row++) {
            for (let col = 0; col < validMoves[row].length; col++) {
                if (validMoves[row][col] && predicate(row, col)) {
                    moves.push([row, col])
                }
            }
        }

        return randomItem(moves)
    }

    function getPositionMove(validMoves, positions) {
        return randomItem(positions.filter(([row, col]) => validMoves[row]?.[col] === true))
    }

    function getOpponentRouter(board) {
        // Preserve the original script's router-identification assumption.
        return board[0][0] === PLAYER ? board[1][1] : board[0][0]
    }

    function getMoveToEliminateCluster(board, validMoves, opponentRouter) {
        if (!opponentRouter) return null

        const directions = [
            [0, 1],
            [1, 0],
            [0, -1],
            [-1, 0],
            [1, 1],
            [-1, -1],
            [1, -1],
            [-1, 1],
        ]

        for (let row = 0; row < board.length; row++) {
            for (let col = 0; col < board[row].length; col++) {
                if (board[row][col] !== opponentRouter) continue

                let freeCount = 0
                let lastFreeMove = null

                for (const [dr, dc] of directions) {
                    const r = row + dr
                    const c = col + dc

                    if (r < 0 || r >= board.length || c < 0 || c >= board[r].length) {
                        continue
                    }

                    if (board[r][c] === '' && validMoves[r]?.[c] === true) {
                        freeCount++
                        lastFreeMove = [r, c]

                        if (freeCount > 1) break
                    }
                }

                if (freeCount === 1) return lastFreeMove
            }
        }

        return null
    }

    while (true) {
        // Reset strategy phases for each new game.
        let phase = 1
        let endTheGame = false
        let result

        while (true) {
            const board = ns.go.getBoardState()
            const validMoves = ns.go.analysis.getValidMoves()
            let move = null

            if (endTheGame) {
                result = await ns.go.passTurn()
                break
            }

            // Advance through completed phases until a move is found.
            while (move === null && phase <= 5) {
                switch (phase) {
                    case 1:
                        move = getRandomMove(validMoves, (row) => row === CENTER)
                        break

                    case 2:
                        move = getRandomMove(validMoves, (_, col) => col === CENTER)
                        break

                    case 3:
                        move = getPositionMove(validMoves, phase3)
                        break

                    case 4:
                        move = getPositionMove(validMoves, phase4)
                        break

                    case 5:
                        move = getPositionMove(validMoves, phase5)
                        break
                }

                if (move === null) phase++
            }

            // Final phase: eliminate vulnerable routers, then random moves.
            if (move === null) {
                const opponentRouter = getOpponentRouter(board)

                move = getMoveToEliminateCluster(board, validMoves, opponentRouter)

                if (move === null) {
                    move = getRandomMove(validMoves, (row, col) => !excluded.has(`${row},${col}`))
                }
            }

            if (move === null) {
                result = await ns.go.passTurn()
            } else {
                result = await ns.go.makeMove(move[0], move[1])
            }

            if (result?.type === 'gameOver') break

            const opponentMove = await ns.go.opponentNextTurn()

            if (opponentMove?.type === 'pass') {
                endTheGame = true
            }

            await ns.sleep(MOVE_DELAY)
        }

        const opponent = randomItem(OPPONENTS)
        ns.go.resetBoardState(opponent, BOARD_SIZE)
    }
}
