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
            ;[a[i], a[j]] = [a[j], a[i]]
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
    pressedFrame?: number
}

export type State = {
    board: Board
    activePiece?: ActivePiece
    truePieceY?: number
    frameDropped?: number
    lockResets: number
    queue: Queue
    queueIndex: number
    holdPiece?: number
    holdAvailable: boolean
}

export const dt = 1 / 60

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

export const config = {
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
    visibleQueuePieces: 4,
    keyMap: {
        left: 'KeyA',
        right: 'KeyD',
        ccw: 'KeyJ',
        cw: 'KeyL',
        r180: 'KeyK',
        soft: 'KeyS',
        hard: 'Space',
        hold: 'KeyI'
    },
    // TODO: fractional rates
    handling: {
        arr: 2,
        das: 10,
        sdf: 20
    },
    gameConfig: {
        gravity: 2 / 60,
        lockDelay: 30,
        lockResetLimit: 15
    }
}

export const App: Component = () => {
    let canvas!: HTMLCanvasElement
    let ctx!: Context
    let engine!: Engine
    const subs: Subscription[] = []

    const state: State = {
        board: [],
        activePiece: undefined,
        truePieceY: undefined,
        frameDropped: undefined,
        lockResets: 0,
        queue: generateQueue(piecesDescription, piecesDescription.length * 64),
        queueIndex: 0,
        holdAvailable: true
    }

    const resizeWindow = (): void => {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
    }

    const boardToScreen = (v: Vector): Vector => {
        const screenSize = vec(canvas.width, canvas.height)
        const screenCenter = screenSize.scale(0.5)
        const blockSize = config.blockScreenSize
        const viewSize = config.boardSize.add(vec(0, 2)).scale(blockSize)
        const viewCenter = viewSize.scale(0.5)
        const res = v.add(vec(0.5, 0.5)).scale(blockSize).add(viewCenter.negate()).scale(vec(1, -1)).add(screenCenter)
        return vec(Math.floor(res.x), Math.floor(res.y))
    }

    const drawBlock = (pos: Vector, opts: DrawOptions): void => {
        ctx.rect(boardToScreen(pos), config.blockScreenSize, { ...opts, lineWidth: config.blockLineWidth })
    }

    const pieceBoardPos = (piece: ActivePiece): Piece => {
        return {
            blocks: pieces[piece.pieceId].orientations[piece.orientation].blocks.map(b => piece.position.add(b))
        }
    }

    const drawPiece = (piece: ActivePiece, opts: DrawOptions): void => {
        pieceBoardPos(piece).blocks.forEach(pos => drawBlock(pos, opts))
    }

    const drawBoard = (board: Board): void => {
        const stroke = config.colors[1]
        const gridOpts = { fill: config.colors[0], stroke }

        for (let j = 0; j < config.boardSize.x; j++) {
            for (let i = 0; i < Math.max(config.boardSize.y, board.length); i++) {
                const pos = vec(j, i)
                if (board.length > i) {
                    drawBlock(pos, { fill: config.colors[board[i][j]], stroke: config.colors[1] })
                } else {
                    ctx.rect(boardToScreen(pos), config.blockScreenSize, gridOpts)
                }
            }
        }
    }

    const drawQueue = (state: State): void => {
        const offset = vec(2.5, 0)
        // TODO: won't show pieces when wrapping queue around
        state.queue.slice(state.queueIndex, state.queueIndex + config.visibleQueuePieces).forEach(pieceId => {
            const height = Math.max(...piecesDescription[pieceId].blocks.map(b => b.y)) + 1
            offset.y -= height
            const rotationModeOffset = vec(piecesDescription[pieceId].rotationMode === 'normal' ? 0 : -0.5, 0)
            drawPiece(
                { pieceId, position: config.boardSize.add(offset).add(rotationModeOffset), orientation: 0 },
                { fill: config.colors[pieceId + 3], stroke: config.colors[1] }
            )
            offset.y -= 1
        })
    }

    const drawHold = (state: State): void => {
        if (state.holdPiece !== undefined) {
            const pieceId = state.holdPiece
            const height = Math.max(...piecesDescription[pieceId].blocks.map(b => b.y)) + 1
            const rotationModeOffset = piecesDescription[pieceId].rotationMode === 'normal' ? 0 : 0.5
            drawPiece(
                { pieceId, position: vec(-3.5 - rotationModeOffset, config.boardSize.y - height), orientation: 0 },
                { fill: config.colors[pieceId + 3], stroke: config.colors[1] }
            )
        }
    }

    const drawGhost = (state: State, piece: ActivePiece): void => {
        const ghost: ActivePiece = {
            pieceId: piece.pieceId,
            position: piece.position,
            orientation: piece.orientation
        }
        while (canFell(state.board, ghost)) {
            ghost.position = ghost.position.add(vec(0, -1))
        }
        if (piece.position.y === ghost.position.y) return

        drawPiece(ghost, { stroke: config.colors[piece.pieceId + 3] })
    }

    const insertPiece = (board: Board, piece: ActivePiece): void => {
        pieceBoardPos(piece).blocks.forEach(pos => {
            const missingLines = 1 + pos.y - board.length
            for (let i = 0; i < missingLines; i++) {
                board.push(new Array(config.boardSize.x).fill(0))
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
            if (pos.x < 0 || pos.x >= config.boardSize.x || pos.y < 0) return true
            if (pos.y >= board.length) return false
            const boardBlock = board[pos.y][pos.x]
            return boardBlock > 0
        })
    }

    const canFell = (board: Board, piece: ActivePiece): boolean => {
        piece.position.y--
        const result = !collides(board, piece)
        piece.position.y++
        return result
    }

    const handleKeyboard = (): void => {
        const handleKey = (e: KeyboardEvent): void => {
            if (e.repeat) return
            const result = Object.entries(config.keyMap).find(([, code]) => code === e.code)
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

            if (button.pressed) {
                button.pressedFrame = engine.frameInfo.id
            }
            if (button.released) {
                button.pressedFrame = undefined
            }
        })
    }

    /**
     * TODO: support 0F rates
     */
    const buttonFires = (button: Button, startDelay: number, repeatRate: number): boolean => {
        if (button.pressed) return true
        if (button.pressedFrame) {
            const framesDown = engine.frameInfo.id - button.pressedFrame
            const framesRepeat = framesDown - startDelay
            return framesRepeat >= 0 && framesRepeat % repeatRate === 0
        }
        return false
    }

    const updatePiece = (): void => {
        if (!state.activePiece) throw Error()

        const originalPos = state.activePiece.position
        const checkPos = () => {
            if (collides(state.board, state.activePiece!)) {
                state.activePiece!.position = originalPos
            } else {
                lockReset(state)
            }
        }
        if (buttonFires(input.right, config.handling.das, config.handling.arr)) {
            state.activePiece.position = state.activePiece.position.add(vec(1, 0))
            checkPos()
        }
        if (buttonFires(input.left, config.handling.das, config.handling.arr)) {
            state.activePiece.position = state.activePiece.position.add(vec(-1, 0))
            checkPos()
        }

        const originalOrient = state.activePiece.orientation
        const checkOrient = () => {
            // TODO: wall kicks
            if (collides(state.board, state.activePiece!)) {
                state.activePiece!.orientation = originalOrient
            } else {
                lockReset(state)
            }
        }
        if (input.cw.pressed) {
            state.activePiece.orientation = (state.activePiece.orientation + 1) % 4
            checkOrient()
        }
        if (input.ccw.pressed) {
            state.activePiece.orientation = (state.activePiece.orientation + 3) % 4
            checkOrient()
        }
        if (input.r180.pressed) {
            state.activePiece.orientation = (state.activePiece.orientation + 2) % 4
            checkOrient()
        }

        const softDropRepeatRate = Math.floor(1 / (config.gameConfig.gravity * config.handling.sdf))
        if (buttonFires(input.soft, 0, softDropRepeatRate)) {
            if (canFell(state.board, state.activePiece)) {
                state.activePiece.position = state.activePiece.position.add(vec(0, -1))
            }
        }

        if (input.hard.pressed) {
            while (canFell(state.board, state.activePiece)) {
                state.activePiece.position = state.activePiece.position.add(vec(0, -1))
            }
            lockPiece(state)
        }
    }

    const lockReset = (state: State): void => {
        if (state.frameDropped === undefined) return
        if (state.lockResets > config.gameConfig.lockResetLimit) return
        state.lockResets++
        state.frameDropped = undefined
    }

    const lockPiece = (state: State): void => {
        insertPiece(state.board, state.activePiece!)
        clearLines(state.board)
        state.holdAvailable = true
        state.activePiece = undefined
    }

    const spawnPiece = (state: State, pieceId?: number): void => {
        const spawnPos = vec(Math.floor(config.boardSize.x / 2) - 1, config.boardSize.y + 1)
        if (pieceId !== undefined) {
            state.activePiece = { pieceId, position: spawnPos, orientation: 0 }
            return
        }
        pieceId = state.queue[state.queueIndex]
        state.activePiece = { pieceId, position: spawnPos, orientation: 0 }
        state.truePieceY = state.activePiece.position.y
        state.lockResets = 0
        state.queueIndex = (state.queueIndex + 1) % state.queue.length
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
                const currentFrame = engine.frameInfo.id
                updateInput()

                if (!state.activePiece) {
                    spawnPiece(state)
                }

                state.truePieceY! -= config.gameConfig.gravity
                const targetY = Math.ceil(state.truePieceY!)
                while (canFell(state.board, state.activePiece!) && state.activePiece!.position.y > targetY) {
                    state.activePiece!.position = state.activePiece!.position.add(vec(0, -1))
                }
                if (state.activePiece!.position.y !== targetY) {
                    state.truePieceY = state.activePiece!.position.y
                }

                updatePiece()

                if (state.activePiece) {
                    if (canFell(state.board, state.activePiece!)) {
                        state.frameDropped = undefined
                    } else {
                        state.frameDropped ??= currentFrame
                        const framesSinceDrop = currentFrame - state.frameDropped
                        if (framesSinceDrop >= config.gameConfig.lockDelay) {
                            lockPiece(state)
                        }
                    }
                }

                if (input.hold.pressed && state.holdAvailable) {
                    state.holdAvailable = false
                    if (state.holdPiece) {
                        const next = state.holdPiece
                        state.holdPiece = state.activePiece!.pieceId
                        spawnPiece(state, next)
                    } else {
                        state.holdPiece = state.activePiece!.pieceId
                        spawnPiece(state)
                    }
                }
            })
        )
        subs.push(
            engine.eventDispatcher.beforeDraw.subscribe(() => {
                ctx.clear()
                drawBoard(state.board)
                drawQueue(state)
                drawHold(state)
                if (state.activePiece) {
                    drawPiece(state.activePiece, {
                        fill: config.colors[state.activePiece.pieceId + 3],
                        stroke: config.colors[1]
                    })
                    drawGhost(state, state.activePiece)
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
