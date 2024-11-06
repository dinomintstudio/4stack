import { Engine, Vector, vec } from '@vole-engine/core'
import { Context } from '@vole-engine/draw'
import { Subscription } from 'rxjs'
import { Component, createSignal, onCleanup, onMount } from 'solid-js'
import { Schema, conformSchema } from '../../schema'
import { Settings } from '../settings/Settings'
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
    wallKickTable: WallKickTable
}

/**
 * Wall kick table in format [fromOrient][toOrient]?.[testNo]
 */
export type WallKickTable = Vector[][][]

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
    /**
     * True if button was *down* on the last frame
     */
    held: boolean
    /**
     * True if button is currently down
     */
    down: boolean
    /**
     * True only on the first frame after a key press
     */
    pressed: boolean
    /**
     * True only on the first frame after a key release
     */
    released: boolean
    /**
     * Frame id of the latest key press
     */
    pressedFrame?: number
}

export type ActionType = keyof Input

export type Action = {
    type: 'press' | 'repeat' | '0f'
    action: ActionType
}

export type State = {
    board: Board
    activePiece?: ActivePiece
    /**
     * Fractional piece position
     */
    truePieceY?: number
    /**
     * Frame id of the first frame where piece is *dropped* (can no longer fall)
     */
    frameDropped?: number
    /**
     * Number of lock resets used for the active piece
     */
    lockResets: number
    /**
     * Unmodifiable list of pieces the game goes through
     */
    queue: Queue
    queueIndex: number
    holdPiece?: number
    /**
     * False if hold action was already used for the active piece
     */
    holdAvailable: boolean
    keyBuffer: KeyboardEvent[]
    actionBuffer: Action[]
}

export const dt = 1 / 60

/*       Test 1   Test 2   Test 3   Test 4   Test 5
 * 0->R  ( 0, 0)  (-1, 0)  (-1,+1)  ( 0,-2)  (-1,-2)
 * R->0  ( 0, 0)  (+1, 0)  (+1,-1)  ( 0,+2)  (+1,+2)
 * R->2  ( 0, 0)  (+1, 0)  (+1,-1)  ( 0,+2)  (+1,+2)
 * 2->R  ( 0, 0)  (-1, 0)  (-1,+1)  ( 0,-2)  (-1,-2)
 * 2->L  ( 0, 0)  (+1, 0)  (+1,+1)  ( 0,-2)  (+1,-2)
 * L->2  ( 0, 0)  (-1, 0)  (-1,-1)  ( 0,+2)  (-1,+2)
 * L->0  ( 0, 0)  (-1, 0)  (-1,-1)  ( 0,+2)  (-1,+2)
 * 0->L  ( 0, 0)  (+1, 0)  (+1,+1)  ( 0,-2)  (+1,-2)
 */
export const normalWallKickTable: WallKickTable = [
    [
        [vec(0, 0)],
        [vec(0, 0), vec(-1, 0), vec(-1, 1), vec(0, -2), vec(-1, -2)],
        [vec(0, 0)], // TODO: 180 kick
        [vec(0, 0), vec(1, 0), vec(1, 1), vec(0, -2), vec(1, -2)]
    ],
    [
        [vec(0, 0), vec(1, 0), vec(1, -1), vec(0, 2), vec(1, 2)],
        [vec(0, 0)],
        [vec(0, 0), vec(1, 0), vec(1, -1), vec(0, 2), vec(1, 2)],
        [vec(0, 0)] // TODO: 180 kick
    ],
    [
        [vec(0, 0)], // TODO: 180 kick
        [vec(0, 0), vec(-1, 0), vec(-1, 1), vec(0, -2), vec(-1, -2)],
        [vec(0, 0)],
        [vec(0, 0), vec(1, 0), vec(1, 1), vec(0, -2), vec(1, -2)]
    ],
    [
        [vec(0, 0), vec(-1, 0), vec(-1, -1), vec(0, 2), vec(-1, 2)],
        [vec(0, 0)], // TODO: 180 kick
        [vec(0, 0), vec(-1, 0), vec(-1, -1), vec(0, 2), vec(-1, 2)],
        [vec(0, 0)]
    ]
]

/**      Test 1   Test 2   Test 3   Test 4   Test 5
 * 0->R  ( 0, 0)  (-2, 0)  (+1, 0)  (-2,-1)  (+1,+2)
 * R->0  ( 0, 0)  (+2, 0)  (-1, 0)  (+2,+1)  (-1,-2)
 * R->2  ( 0, 0)  (-1, 0)  (+2, 0)  (-1,+2)  (+2,-1)
 * 2->R  ( 0, 0)  (+1, 0)  (-2, 0)  (+1,-2)  (-2,+1)
 * 2->L  ( 0, 0)  (+2, 0)  (-1, 0)  (+2,+1)  (-1,-2)
 * L->2  ( 0, 0)  (-2, 0)  (+1, 0)  (-2,-1)  (+1,+2)
 * L->0  ( 0, 0)  (+1, 0)  (-2, 0)  (+1,-2)  (-2,+1)
 * 0->L  ( 0, 0)  (-1, 0)  (+2, 0)  (-1,+2)  (+2,-1)
 */
export const iPieceWallKickTable: WallKickTable = [
    [
        [vec(0, 0)],
        [vec(0, 0), vec(-2, 0), vec(1, 1), vec(-2, -1), vec(1, 2)],
        [vec(0, 0)], // TODO: 180 kick
        [vec(0, 0), vec(-1, 0), vec(2, 0), vec(-1, 2), vec(2, -1)]
    ],
    [
        [vec(0, 0), vec(2, 0), vec(-1, 0), vec(2, 1), vec(-1, -2)],
        [vec(0, 0)],
        [vec(0, 0), vec(-1, 0), vec(2, 0), vec(-1, 2), vec(2, -1)],
        [vec(0, 0)] // TODO: 180 kick
    ],
    [
        [vec(0, 0)], // TODO: 180 kick
        [vec(0, 0), vec(1, 0), vec(-2, 0), vec(1, -2), vec(-2, 1)],
        [vec(0, 0)],
        [vec(0, 0), vec(2, 0), vec(-1, 0), vec(2, 1), vec(-1, -2)]
    ],
    [
        [vec(0, 0), vec(1, 0), vec(-2, 0), vec(1, -2), vec(-2, 1)],
        [vec(0, 0)], // TODO: 180 kick
        [vec(0, 0), vec(-2, 0), vec(1, 0), vec(-2, -1), vec(1, 2)],
        [vec(0, 0)]
    ]
]

export const piecesDescription: PieceDescription[] = [
    {
        // I piece
        blocks: [vec(0, 0), vec(-1, 0), vec(1, 0), vec(2, 0)],
        rotationMode: 'between',
        wallKickTable: iPieceWallKickTable
    },
    {
        // O piece
        blocks: [vec(0, 0), vec(1, 0), vec(1, 1), vec(0, 1)],
        rotationMode: 'off',
        wallKickTable: normalWallKickTable
    },
    {
        // T piece
        blocks: [vec(0, 0), vec(0, 1), vec(1, 0), vec(-1, 0)],
        rotationMode: 'normal',
        wallKickTable: normalWallKickTable
    },
    {
        // S piece
        blocks: [vec(0, 0), vec(-1, 0), vec(0, 1), vec(1, 1)],
        rotationMode: 'normal',
        wallKickTable: normalWallKickTable
    },
    {
        // Z piece
        blocks: [vec(0, 0), vec(1, 0), vec(0, 1), vec(-1, 1)],
        rotationMode: 'normal',
        wallKickTable: normalWallKickTable
    },
    {
        // J piece
        blocks: [vec(0, 0), vec(-1, 1), vec(-1, 0), vec(1, 0)],
        rotationMode: 'normal',
        wallKickTable: normalWallKickTable
    },
    {
        // L piece
        blocks: [vec(0, 0), vec(1, 1), vec(1, 0), vec(-1, 0)],
        rotationMode: 'normal',
        wallKickTable: normalWallKickTable
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

export const userSettingsSchema: Schema = {
    type: 'group',
    title: 'User settings',
    items: {
        keyMap: {
            type: 'group',
            title: 'Controls',
            items: {
                left: { type: 'key', title: 'Left', description: 'Shift left' },
                right: { type: 'key', title: 'Right', description: 'Shift right' },
                cw: { type: 'key', title: 'CW', description: 'Rotate clockwise' },
                ccw: { type: 'key', title: 'CCW', description: 'Rotate counter-clockwise' },
                r180: { type: 'key', title: '180', description: 'Rotate 180' },
                soft: { type: 'key', title: 'Soft', description: 'Soft drop' },
                hard: { type: 'key', title: 'Hard', description: 'Hard drop' },
                hold: { type: 'key', title: 'Hold', description: 'Hold piece' }
            }
        },
        handling: {
            type: 'group',
            title: 'Handling',
            items: {
                arr: { type: 'number', title: 'ARR', description: 'Auto repeat rate' },
                das: { type: 'number', title: 'DAS', description: 'Delayed auto shift' },
                sdf: { type: 'number', title: 'SDF', description: 'Soft drop factor' }
            }
        }
    }
}

export const defaultUserSettings = {
    keyMap: {
        left: 'ArrowLeft',
        right: 'ArrowRight',
        cw: 'KeyZ',
        ccw: 'KeyX',
        r180: 'KeyA',
        soft: 'ArrowDown',
        hard: 'Space',
        hold: 'KeyC'
    },
    // DAS cut delay
    handling: {
        arr: 2,
        das: 10,
        sdf: 6
    }
}

export const [userSettings, setUserSettings] = createSignal(defaultUserSettings)

export type BlockVisual = { style: 'solid' | 'stroke' | 'strokeOver'; strokeWidth: number }

export const config = {
    boardSize: vec(10, 20),
    visual: {
        blockScreenSize: vec(40, 40),
        colors: [
            'transparent',
            '#333333',
            '#555555',
            '#9fd8cb',
            '#e3e500',
            '#c589e8',
            '#2b9720',
            '#d04638',
            '#5386e4',
            '#e58d3e'
        ],
        gridLineWidth: 1,
        visibleQueuePieces: 4,
        block: {
            style: 'solid' as const
        },
        ghost: {
            style: 'strokeOver' as const,
            strokeWidth: 2
        }
    },
    game: {
        gravity: 2 / 60,
        lockDelay: 30,
        lockResetLimit: 15
    }
}

export const App: Component = () => {
    let canvas: HTMLCanvasElement
    let ctx: Context
    let engine: Engine
    const subs: Subscription[] = []
    let state: State

    const createState = (): State => ({
        board: [],
        activePiece: undefined,
        truePieceY: undefined,
        frameDropped: undefined,
        lockResets: 0,
        queue: generateQueue(piecesDescription, piecesDescription.length * 64),
        queueIndex: 0,
        holdAvailable: true,
        keyBuffer: [],
        actionBuffer: []
    })

    const resizeWindow = (): void => {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
    }

    const boardToScreen = (v: Vector): Vector => {
        const screenSize = vec(canvas.width, canvas.height)
        const screenCenter = screenSize.scale(0.5)
        const blockSize = config.visual.blockScreenSize
        const viewSize = config.boardSize.add(vec(0, 2)).scale(blockSize)
        const viewCenter = viewSize.scale(0.5)
        const res = v.add(vec(0.5, 0.5)).scale(blockSize).add(viewCenter.negate()).scale(vec(1, -1)).add(screenCenter)
        return vec(Math.floor(res.x), Math.floor(res.y))
    }

    const drawBlock = (pos: Vector, visual: BlockVisual, color: Color): void => {
        const c = config.visual.colors[color]
        const lineWidth = visual.strokeWidth ?? 0
        switch (visual.style) {
            case 'solid':
                ctx.rect(boardToScreen(pos), config.visual.blockScreenSize, { fill: c })
                break
            case 'stroke':
                ctx.rect(boardToScreen(pos), config.visual.blockScreenSize.add(Vector.One.scale(-lineWidth)), {
                    stroke: c,
                    lineWidth
                })
                break
            case 'strokeOver':
                ctx.rect(boardToScreen(pos), config.visual.blockScreenSize, {
                    stroke: c,
                    lineWidth
                })
                break
        }
    }

    const pieceBoardPos = (piece: ActivePiece): Piece => {
        return {
            blocks: pieces[piece.pieceId].orientations[piece.orientation].blocks.map(b => piece.position.add(b))
        }
    }

    const drawPiece = (piece: ActivePiece, blockStyle: BlockVisual, color: Color): void => {
        pieceBoardPos(piece).blocks.forEach(pos => drawBlock(pos, blockStyle, color))
    }

    const drawBoard = (board: Board): void => {
        const { colors, blockScreenSize } = config.visual
        const stroke = colors[1]
        const gridOpts = { fill: colors[0], stroke }

        const fullHeight = Math.max(config.boardSize.y, board.length)
        for (let j = 0; j < config.boardSize.x; j++) {
            for (let i = 0; i < fullHeight; i++) {
                const pos = vec(j, i)
                ctx.rect(boardToScreen(pos), blockScreenSize, gridOpts)
            }
        }
        for (let j = 0; j < config.boardSize.x; j++) {
            for (let i = 0; i < board.length; i++) {
                const pos = vec(j, i)
                drawBlock(pos, config.visual.block as BlockVisual, board[i][j])
            }
        }
    }

    const drawQueue = (state: State): void => {
        const offset = vec(2.5, 0)
        for (let i = state.queueIndex; i < state.queueIndex + config.visual.visibleQueuePieces; i++) {
            const idx = i % state.queue.length
            const pieceId = state.queue[idx]
            const height = Math.max(...piecesDescription[pieceId].blocks.map(b => b.y)) + 1
            offset.y -= height
            const rotationModeOffset = vec(piecesDescription[pieceId].rotationMode === 'normal' ? 0 : -0.5, 0)
            drawPiece(
                { pieceId, position: config.boardSize.add(offset).add(rotationModeOffset), orientation: 0 },
                config.visual.block as BlockVisual,
                pieceId + 3
            )
            offset.y -= 1
        }
    }

    const drawHold = (state: State): void => {
        if (state.holdPiece !== undefined) {
            const pieceId = state.holdPiece
            const height = Math.max(...piecesDescription[pieceId].blocks.map(b => b.y)) + 1
            const rotationModeOffset = piecesDescription[pieceId].rotationMode === 'normal' ? 0 : 0.5
            drawPiece(
                { pieceId, position: vec(-3.5 - rotationModeOffset, config.boardSize.y - height), orientation: 0 },
                config.visual.block as BlockVisual,
                pieceId + 3
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

        drawPiece(ghost, config.visual.ghost as BlockVisual, piece.pieceId + 3)
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

    const clearLines = (board: Board): number => {
        const len = board.length
        for (let i = board.length - 1; i >= 0; i--) {
            const line = board[i]
            if (line.every(b => b > 0)) {
                board.splice(i, 1)
            }
        }
        return len - board.length
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
            state.keyBuffer.push(e)
        }
        window.addEventListener('keydown', handleKey)
        window.addEventListener('keyup', handleKey)
    }

    const updateInput = (): void => {
        state.keyBuffer.forEach(e => {
            const actionCodeTuple = Object.entries(userSettings().keyMap).find(([, code]) => code === e.code)
            if (!actionCodeTuple) return
            const action = actionCodeTuple[0] as ActionType
            const button = input[action]
            button.down = e.type === 'keydown'
        })

        state.actionBuffer = []

        Object.entries(input).forEach(([action, button]) => {
            button.pressed = button.down && !button.held
            button.released = !button.down && button.held
            button.held = button.down

            if (button.pressed) {
                button.pressedFrame = engine.frameInfo.id
                state.actionBuffer.push({ type: 'press', action: action as ActionType })
            }
            if (button.released) {
                button.pressedFrame = undefined
            }
        })

        const handling = userSettings().handling
        Object.entries(input)
            .filter(([action]) => action === 'left' || action === 'right')
            .forEach(([action, button]) => {
                if (button.pressedFrame) {
                    const framesDown = engine.frameInfo.id - button.pressedFrame
                    const framesRepeat = framesDown - handling.das
                    if (framesRepeat >= 0 && (handling.arr === 0 || framesRepeat % handling.arr < 1)) {
                        const type = handling.arr === 0 ? '0f' : 'repeat'
                        state.actionBuffer.push({ type, action: action as ActionType })
                    }
                }
            })
        if (input.soft.pressedFrame) {
            const framesDown = engine.frameInfo.id - input.soft.pressedFrame
            const softDropRepeatRate = Math.floor(1 / (config.game.gravity * handling.sdf))
            if (handling.sdf === 0 || framesDown % softDropRepeatRate < 1) {
                const type = handling.sdf === 0 ? '0f' : 'repeat'
                state.actionBuffer.push({ type, action: 'soft' })
            }
        }
    }

    const executeActionBuffer = (state: State): void => {
        state.actionBuffer.forEach(action => {
            switch (action.action) {
                case 'left':
                case 'right':
                    if (action.type === '0f') {
                        while (executeShift(state, action.action)) {}
                    } else {
                        executeShift(state, action.action)
                    }
                    break
                case 'ccw':
                case 'cw':
                case 'r180':
                    executeRotate(state, action.action)
                    break
                case 'soft':
                    if (action.type === '0f') {
                        while (executeSoftDrop(state)) {}
                    } else {
                        executeSoftDrop(state)
                    }
                    break
                case 'hard':
                    executeHardDrop(state)
                    break
                case 'hold':
                    executeHold(state)
                    break
            }
        })
    }

    const executeShift = (state: State, action: ActionType): boolean => {
        const piece = state.activePiece
        if (!piece) return false

        const originalPos = piece.position
        const checkPos = (): boolean => {
            const allow = !collides(state.board, piece)
            if (allow) {
                lockReset(state)
            } else {
                piece.position = originalPos
            }
            return allow
        }
        switch (action) {
            case 'left':
                piece.position = piece.position.add(vec(-1, 0))
                return checkPos()
            case 'right':
                piece.position = piece.position.add(vec(1, 0))
                return checkPos()
            default:
                throw Error()
        }
    }

    const executeRotate = (state: State, action: ActionType): void => {
        const piece = state.activePiece
        if (!piece) return

        const originalPos = piece.position
        const originalOrient = piece.orientation
        const checkOrient = () => {
            const wallKickTable = piecesDescription[piece.pieceId].wallKickTable
            const tests = wallKickTable[originalOrient][piece.orientation]
            for (const test of tests) {
                piece.position = piece.position.add(test)
                if (!collides(state.board, piece)) {
                    lockReset(state)
                    break
                } else {
                    piece.position = originalPos
                }
            }
            if (collides(state.board, piece)) {
                piece.orientation = originalOrient
            } else {
                lockReset(state)
            }
        }

        switch (action) {
            case 'cw':
                piece.orientation = (piece.orientation + 1) % 4
                checkOrient()
                break
            case 'ccw':
                piece.orientation = (piece.orientation + 3) % 4
                checkOrient()
                break
            case 'r180':
                piece.orientation = (piece.orientation + 2) % 4
                checkOrient()
                break
        }
    }

    const executeSoftDrop = (state: State): boolean => {
        const piece = state.activePiece
        if (!piece) return false

        const falling = canFell(state.board, piece)
        if (falling) {
            piece.position = piece.position.add(vec(0, -1))
        }
        return falling
    }

    const executeHardDrop = (state: State): void => {
        const piece = state.activePiece
        if (!piece) return

        while (canFell(state.board, piece)) {
            piece.position = piece.position.add(vec(0, -1))
        }
        lockPiece(state)
    }

    const executeHold = (state: State): void => {
        if (input.hold.pressed && state.holdAvailable) {
            state.holdAvailable = false
            if (state.holdPiece !== undefined) {
                const next = state.holdPiece
                state.holdPiece = state.activePiece!.pieceId
                spawnPiece(state, next)
            } else {
                state.holdPiece = state.activePiece!.pieceId
                spawnPiece(state)
            }
        }
    }

    const lockPieceCheck = (state: State): void => {
        if (state.activePiece) {
            if (canFell(state.board, state.activePiece!)) {
                state.frameDropped = undefined
            } else {
                const currentFrame = engine.frameInfo.id
                state.frameDropped ??= currentFrame
                const framesSinceDrop = currentFrame - state.frameDropped
                if (framesSinceDrop >= config.game.lockDelay) {
                    lockPiece(state)
                }
            }
        }
    }

    const lockReset = (state: State): void => {
        if (state.frameDropped === undefined) return
        if (state.lockResets > config.game.lockResetLimit) return
        state.lockResets++
        state.frameDropped = undefined
    }

    const lockPiece = (state: State): void => {
        insertPiece(state.board, state.activePiece!)
        const clearedLines = clearLines(state.board)

        const lowestY = Math.min(...pieceBoardPos(state.activePiece!).blocks.map(b => b.y))
        if (lowestY - clearedLines > config.boardSize.y - 1) {
            gameOver()
        }

        state.holdAvailable = true
        state.activePiece = undefined
        state.frameDropped = undefined
    }

    const spawnPiece = (state: State, pieceId?: number): void => {
        const spawnPos = vec(Math.floor(config.boardSize.x / 2) - 1, config.boardSize.y + 1)
        if (pieceId === undefined) {
            pieceId = state.queue[state.queueIndex]
            state.queueIndex = (state.queueIndex + 1) % state.queue.length
        }
        state.activePiece = { pieceId, position: spawnPos, orientation: 0 }
        state.truePieceY = state.activePiece.position.y
        state.lockResets = 0

        if (collides(state.board, state.activePiece)) {
            gameOver()
        }
    }

    const gameOver = (): void => {
        state = createState()
    }

    const loadUserSettings = (): void => {
        let v: any
        try {
            v = localStorage.getItem('userSettings')
            v = v ? JSON.parse(v) : defaultUserSettings
            conformSchema(v, userSettingsSchema)
        } catch (e) {
            console.error(`invalid user settings: \`${JSON.stringify(v)}\``, e)
            setUserSettings(defaultUserSettings)
            return
        }
        setUserSettings(v)
    }

    const saveUserSettings = (): void => {
        localStorage.setItem('userSettings', JSON.stringify(userSettings()))
    }

    const updateUserSettings = (v: any): void => {
        setUserSettings(v)
        saveUserSettings()
    }

    onMount(() => {
        loadUserSettings()

        ctx = new Context(canvas)
        resizeWindow()
        window.addEventListener('resize', resizeWindow)
        handleKeyboard()

        engine = new Engine()
        engine.start()
        state = createState()

        subs.push(
            engine.eventDispatcher.beforeUpdate.subscribe(() => {
                updateInput()

                if (!state.activePiece) {
                    spawnPiece(state)
                }
                // no piece after spawn because of game over
                if (!state.activePiece) return

                state.truePieceY! -= config.game.gravity
                const targetY = Math.ceil(state.truePieceY!)
                while (canFell(state.board, state.activePiece!) && state.activePiece!.position.y > targetY) {
                    state.activePiece!.position = state.activePiece!.position.add(vec(0, -1))
                }
                if (state.activePiece!.position.y !== targetY) {
                    state.truePieceY = state.activePiece!.position.y
                }

                executeActionBuffer(state)
                lockPieceCheck(state)
            })
        )
        subs.push(
            engine.eventDispatcher.beforeDraw.subscribe(() => {
                ctx.clear()
                drawBoard(state.board)
                drawQueue(state)
                drawHold(state)
                if (state.activePiece) {
                    drawPiece(state.activePiece, config.visual.block as BlockVisual, state.activePiece.pieceId + 3)
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
            <Settings schema={userSettingsSchema} initialSettings={userSettings} onChange={updateUserSettings} />
            <canvas ref={canvas!} />
        </div>
    )
}
