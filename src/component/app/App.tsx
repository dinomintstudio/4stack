import { Engine, Vector, vec } from '@vole-engine/core'
import { Context, DrawOptions } from '@vole-engine/draw'
import { Subscription } from 'rxjs'
import { type Component, onCleanup, onMount } from 'solid-js'
import './App.module.scss'

export const createOrientations = (desc: PieceDescription): PieceOrientationState => {
    const orientation = { blocks: desc.blocks }
    if (desc.rotationMode === 'off') return { orientations: [orientation, orientation, orientation, orientation] }
    const offset = desc.rotationMode === 'between' ? 1 : 0
    const cw = { blocks: orientation.blocks.map(b => rotateCw(b)) }
    const cw2 = { blocks: cw.blocks.map(b => rotateCw(b)) }
    const cw3 = { blocks: cw2.blocks.map(b => rotateCw(b)) }

    switch (desc.rotationMode) {
        case 'normal':
            return { orientations: [orientation, cw, cw2, cw3] }
        case 'between':
            return {
                orientations: [
                    orientation,
                    { blocks: cw.blocks.map(b => b.add(vec(1, 0).scale(offset))) },
                    { blocks: cw2.blocks.map(b => b.add(vec(1, -1).scale(offset))) },
                    { blocks: cw3.blocks.map(b => b.add(vec(0, -1).scale(offset))) }
                ]
            }
    }
}

export const generateQueue = (desc: PieceDescription[], size: number): number[] => {
    const shuffle = (a: number[]): number[] => {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[a[i], a[j]] = [a[j], a[i]] // Swap elements
        }
        return a
    }

    const queue: number[] = []
    let bag: number[] = []
    for (let i = 0; i < size; i++) {
        if (bag.length === 0) {
            bag = shuffle(new Array(desc.length).fill(0).map((_, i) => i))
        }
        queue.push(bag.splice(0, 1)[0])
    }
    return queue
}

/**
 * (1, -1)
 * ...
 * .o.
 * ..x
 *
 * (-1, -1)
 * ...
 * .o.
 * x..
 */
export const rotateCw = (position: Vector): Vector => vec(position.y, -position.x)

export const createButton = () => ({ held: false, down: false, pressed: false, released: false })

export type Board = Color[][]

export type Queue = number[]

/**
 * 0 is empty
 * 1 is garbage
 * 2-n is a piece color
 */
export type Color = number

export type PieceDescription = {
    blocks: Vector[]
    rotationMode: 'normal' | 'between' | 'off'
}

export type Piece = {
    blocks: Vector[]
}

export type PieceOrientationState = {
    orientations: [Piece, Piece, Piece, Piece]
}

export type ActivePiece = {
    pieceId: number
    position: Vector
    orientation: number
}

export type Input = {
    left: Button
    right: Button
    ccw: Button
    cw: Button
    r180: Button
    soft: Button
    hard: Button
    hold: Button
}

export type Button = {
    held: boolean
    down: boolean
    pressed: boolean
    released: boolean
}

export const piecesDescription: PieceDescription[] = [
    {
        // I piece
        blocks: [vec(0, 0), vec(-1, 0), vec(1, 0), vec(2, 0)],
        rotationMode: 'between'
    },
    {
        // O piece
        blocks: [vec(0, 0), vec(1, 0), vec(1, 1), vec(0, 1)],
        rotationMode: 'off'
    },
    {
        // T piece
        blocks: [vec(0, 0), vec(0, 1), vec(1, 0), vec(-1, 0)],
        rotationMode: 'normal'
    },
    {
        // S piece
        blocks: [vec(0, 0), vec(-1, 0), vec(0, 1), vec(1, 1)],
        rotationMode: 'normal'
    },
    {
        // Z piece
        blocks: [vec(0, 0), vec(1, 0), vec(0, 1), vec(-1, 1)],
        rotationMode: 'normal'
    },
    {
        // J piece
        blocks: [vec(0, 0), vec(-1, 1), vec(-1, 0), vec(1, 0)],
        rotationMode: 'normal'
    },
    {
        // L piece
        blocks: [vec(0, 0), vec(1, 1), vec(1, 0), vec(-1, 0)],
        rotationMode: 'normal'
    }
]

export const pieces: PieceOrientationState[] = piecesDescription.map(createOrientations)

export const input: Input = {
    left: createButton(),
    right: createButton(),
    ccw: createButton(),
    cw: createButton(),
    r180: createButton(),
    soft: createButton(),
    hard: createButton(),
    hold: createButton()
}

export const gameConfig = {
    boardSize: vec(10, 20),
    blockScreenSize: vec(40, 40),
    colors: [
        'transparent',
        '#333333',
        '#555555',
        '#9fd8cb',
        '#e3b505',
        '#c589e8',
        '#2b9720',
        '#a72608',
        '#5386e4',
        '#f55d3e'
    ],
    blockLineWidth: 1,
    keyMap: {
        left: 'KeyA',
        right: 'KeyD',
        ccw: 'KeyJ',
        cw: 'KeyL',
        r180: 'KeyK',
        soft: 'KeyS',
        hard: 'Space',
        hold: 'KeyI'
    }
}

export const App: Component = () => {
    let canvas!: HTMLCanvasElement
    let ctx!: Context
    let engine!: Engine
    const board: Board = []
    const queue: Queue = generateQueue(piecesDescription, piecesDescription.length * 64)
    let pieceIndex = 0
    let activePiece: ActivePiece | undefined
    const subs: Subscription[] = []

    const resizeWindow = (): void => {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
    }

    const boardToScreen = (v: Vector): Vector => {
        const screenSize = vec(canvas.width, canvas.height)
        const screenCenter = screenSize.scale(0.5)
        const blockSize = gameConfig.blockScreenSize
        const viewSize = gameConfig.boardSize.add(vec(5, 2)).scale(blockSize)
        const viewCenter = viewSize.scale(0.5)
        const res = v.add(vec(0.5, 0.5)).scale(blockSize).add(viewCenter.negate()).scale(vec(1, -1)).add(screenCenter)
        return vec(Math.floor(res.x), Math.floor(res.y))
    }

    const drawBoard = (board: Board): void => {
        const stroke = gameConfig.colors[1]
        const gridOpts = { fill: gameConfig.colors[0], stroke }

        for (let j = 0; j < gameConfig.boardSize.x; j++) {
            for (let i = 0; i < Math.max(gameConfig.boardSize.y, board.length); i++) {
                const pos = vec(j, i)
                if (board.length > i) {
                    drawBlock(pos, { fill: gameConfig.colors[board[i][j]], stroke: gameConfig.colors[1] })
                } else {
                    ctx.rect(boardToScreen(pos), gameConfig.blockScreenSize, gridOpts)
                }
            }
        }
    }

    const drawQueue = (queue: Queue, pieceIndex: number): void => {
        const offset = vec(2.5, 0)
        queue.slice(pieceIndex + 1, pieceIndex + 5).forEach((pieceId, i) => {
            const height = Math.max(...piecesDescription[pieceId].blocks.map(b => b.y)) + 1
            offset.y -= height
            const rotationModeOffset = vec(piecesDescription[pieceId].rotationMode === 'normal' ? 0 : -0.5, 0)
            drawPiece(
                { pieceId, position: gameConfig.boardSize.add(offset).add(rotationModeOffset), orientation: 0 },
                { fill: gameConfig.colors[pieceId + 3], stroke: gameConfig.colors[1] }
            )
            offset.y -= 1
        })
    }

    const drawPiece = (piece: ActivePiece, opts: DrawOptions): void => {
        pieceBoardPos(piece).blocks.forEach(pos => drawBlock(pos, opts))
    }

    const drawGhost = (board: Board, piece: ActivePiece): void => {
        const ghost: ActivePiece = { pieceId: piece.pieceId, position: piece.position, orientation: piece.orientation }
        while (!collides(board, ghost)) {
            ghost.position = ghost.position.add(vec(0, -1))
        }
        ghost.position = ghost.position.add(vec(0, 1))
        if (piece.position.y === ghost.position.y) return

        drawPiece(ghost, { stroke: gameConfig.colors[piece.pieceId + 3] })
    }

    const drawBlock = (pos: Vector, opts: DrawOptions): void => {
        ctx.rect(boardToScreen(pos), gameConfig.blockScreenSize, { ...opts, lineWidth: gameConfig.blockLineWidth })
    }

    const pieceBoardPos = (piece: ActivePiece): Piece => {
        return {
            blocks: pieces[piece.pieceId].orientations[piece.orientation].blocks.map(b => piece.position.add(b))
        }
    }

    const insertPiece = (board: Board, piece: ActivePiece): void => {
        pieceBoardPos(piece).blocks.forEach(pos => {
            const missingLines = 1 + pos.y - board.length
            for (let i = 0; i < missingLines; i++) {
                board.push(new Array(gameConfig.boardSize.x).fill(0))
            }
            board[pos.y][pos.x] = piece.pieceId + 3
        })
    }

    const clearLines = (board: Board): void => {
        for (let i = board.length - 1; i >= 0; i--) {
            const line = board[i]
            if (line.every(b => b > 0)) {
                board.splice(i, 1)
            }
        }
    }

    const collides = (board: Board, piece: ActivePiece): boolean => {
        const blocks = pieceBoardPos(piece)
        return blocks.blocks.some(pos => {
            if (pos.x < 0 || pos.x >= gameConfig.boardSize.x || pos.y < 0) return true
            if (pos.y >= board.length) return false
            const boardBlock = board[pos.y][pos.x]
            return boardBlock > 0
        })
    }

    const handleKeyboard = (): void => {
        const handleKey = (e: KeyboardEvent): void => {
            if (e.repeat) return
            const result = Object.entries(gameConfig.keyMap).find(([, code]) => code === e.code)
            if (!result) return
            const [action] = result
            const button = input[action as keyof Input]
            button.down = e.type === 'keydown'
        }
        window.addEventListener('keydown', handleKey)
        window.addEventListener('keyup', handleKey)
    }

    const updateInput = (): void => {
        Object.values(input).forEach(button => {
            button.pressed = button.down && !button.held
            button.released = !button.down && button.held
            button.held = button.down
        })
    }

    const updatePiece = (): void => {
        if (!activePiece) throw Error()
        const originalPos = activePiece.position

        if (input.right.pressed) {
            activePiece.position = activePiece.position.add(vec(1, 0))
        }
        if (input.left.pressed) {
            activePiece.position = activePiece.position.add(vec(-1, 0))
        }
        if (collides(board, activePiece)) {
            activePiece.position = originalPos
        }

        const originalOrient = activePiece.orientation
        if (input.cw.pressed) {
            activePiece.orientation = (activePiece.orientation + 1) % 4
        }
        if (input.ccw.pressed) {
            activePiece.orientation = (activePiece.orientation + 3) % 4
        }
        if (input.r180.pressed) {
            activePiece.orientation = (activePiece.orientation + 2) % 4
        }

        // TODO: wall kicks
        if (collides(board, activePiece)) {
            activePiece.orientation = originalOrient
        }

        if (input.hard.pressed) {
            while (!collides(board, activePiece)) {
                activePiece.position = activePiece.position.add(vec(0, -1))
            }
            // TODO: will ascend if not checked for game over
            activePiece.position = activePiece.position.add(vec(0, 1))
            insertPiece(board, activePiece)
            clearLines(board)
            activePiece = undefined
            pieceIndex = (pieceIndex + 1) % queue.length
        }
    }

    onMount(() => {
        ctx = new Context(canvas)
        resizeWindow()
        window.addEventListener('resize', resizeWindow)
        handleKeyboard()

        engine = new Engine()
        engine.start()
        subs.push(
            engine.eventDispatcher.beforeUpdate.subscribe(() => {
                updateInput()

                if (!activePiece) {
                    const spawnPos = vec(Math.floor(gameConfig.boardSize.x / 2) - 1, gameConfig.boardSize.y)
                    const pieceId = queue[pieceIndex]
                    // TODO: piece selection
                    activePiece = { pieceId, position: spawnPos, orientation: 0 }
                }

                updatePiece()
            })
        )
        subs.push(
            engine.eventDispatcher.beforeDraw.subscribe(() => {
                ctx.clear()
                drawBoard(board)
                drawQueue(queue, pieceIndex)
                if (activePiece) {
                    drawPiece(activePiece, {
                        fill: gameConfig.colors[activePiece.pieceId + 3],
                        stroke: gameConfig.colors[1]
                    })
                    drawGhost(board, activePiece)
                }
            })
        )
    })

    onCleanup(() => {
        subs.forEach(s => s.unsubscribe())
    })

    return (
        <div class="App">
            <canvas ref={canvas} />
        </div>
    )
}
