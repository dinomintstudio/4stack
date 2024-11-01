import { Engine, Vector, vec } from '@vole-engine/core'
import { Context } from '@vole-engine/draw'
import { Subscription } from 'rxjs'
import { type Component, onCleanup, onMount } from 'solid-js'
import './App.module.scss'

export const createOrientations = (desc: PieceDescription): PieceOrientationState => {
    const orientation = { blocs: desc.blocs }
    if (desc.rotationMode === 'off') return { orientations: [orientation, orientation, orientation, orientation] }
    const offset = desc.rotationMode === 'between' ? 1 : 0
    const cw = { blocs: orientation.blocs.map(b => rotateCw(b).add(Vector.Right.scale(offset))) }
    const cw2 = { blocs: cw.blocs.map(b => rotateCw(b).add(Vector.Right.scale(offset))) }
    const cw3 = { blocs: cw2.blocs.map(b => rotateCw(b).add(Vector.Right.scale(offset))) }

    return { orientations: [orientation, cw, cw2, cw3] }
}

/**
 * (1, 1)
 * ...
 * .o.
 * ..x
 *
 * (-1, 1)
 * ...
 * .o.
 * x..
 */
export const rotateCw = (position: Vector): Vector => vec(-position.y, position.x)

export type Board = Color[][]

/**
 * 0 is empty
 * 1 is garbage
 * 2-n is a piece color
 */
export type Color = number

export type PieceDescription = {
    blocs: Vector[]
    rotationMode: 'normal' | 'between' | 'off'
}

export type Piece = {
    blocs: Vector[]
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
    pressed: boolean
    released: boolean
}

export const piecesDescription: PieceDescription[] = [
    {
        // I piece
        blocs: [vec(0, 0), vec(-1, 0), vec(1, 0), vec(2, 0)],
        rotationMode: 'between'
    },
    {
        // O piece
        blocs: [vec(0, 0), vec(1, 0), vec(1, 1), vec(0, 1)],
        rotationMode: 'off'
    },
    {
        // T piece
        blocs: [vec(0, 0), vec(0, -1), vec(1, 0), vec(-1, 0)],
        rotationMode: 'normal'
    },
    {
        // S piece
        blocs: [vec(0, 0), vec(-1, 0), vec(0, -1), vec(1, -1)],
        rotationMode: 'normal'
    },
    {
        // Z piece
        blocs: [vec(0, 0), vec(1, 0), vec(0, -1), vec(-1, -1)],
        rotationMode: 'normal'
    },
    {
        // J piece
        blocs: [vec(0, 0), vec(-1, -1), vec(-1, 0), vec(1, 0)],
        rotationMode: 'normal'
    },
    {
        // L piece
        blocs: [vec(0, 0), vec(1, -1), vec(1, 0), vec(-1, 0)],
        rotationMode: 'normal'
    }
]

export const pieces: PieceOrientationState[] = piecesDescription.map(createOrientations)

export const gameConfig = {
    boardSize: vec(10, 20),
    blockScreenSize: vec(40, 40),
    colors: ['#111111', '#333333', 'cyan', 'yellow', 'purple', 'green', 'red', 'blue', 'orange']
}

export const App: Component = () => {
    let canvas!: HTMLCanvasElement
    let ctx!: Context
    let engine!: Engine
    const board: Board = []
    let activePiece: ActivePiece | undefined
    const subs: Subscription[] = []

    const resizeWindow = (): void => {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
    }

    const drawBoard = (board: Board): void => {
        const screenSize = vec(canvas.width, canvas.height)
        const screenCenter = screenSize.scale(0.5)
        const blockSize = gameConfig.blockScreenSize
        const boardSize = gameConfig.boardSize.scale(blockSize)
        const gridOpts = { stroke: '#444444' }

        for (let i = 0; i < gameConfig.boardSize.x; i++) {
            for (let j = 0; j < gameConfig.boardSize.y; j++) {
                ctx.rect(
                    blockSize.scale(vec(i, j)).add(blockSize.scale(0.5)).add(screenCenter).add(boardSize.scale(-0.5)),
                    blockSize,
                    gridOpts
                )
            }
        }

        // TODO: draw board
    }

    const drawActivePiece = (activePiece: ActivePiece): void => {
        const screenSize = vec(canvas.width, canvas.height)
        const screenCenter = screenSize.scale(0.5)
        const blockSize = gameConfig.blockScreenSize
        const boardSize = gameConfig.boardSize.scale(blockSize)
        const opts = { fill: gameConfig.colors[activePiece.pieceId + 2], stroke: '#444444' }
        const gridOffset = vec(Math.floor(gameConfig.boardSize.x / 2) - 1, -1)

        pieces[activePiece.pieceId].orientations[activePiece.orientation].blocs.forEach(block => {
            const position = activePiece.position
                .add(block)
                .add(gridOffset)
                .scale(blockSize)
                .add(blockSize.scale(0.5))
                .add(screenCenter)
                .add(boardSize.scale(-0.5))
            ctx.rect(position, blockSize, opts)
        })
    }

    onMount(() => {
        ctx = new Context(canvas)
        resizeWindow()
        window.addEventListener('resize', resizeWindow)

        engine = new Engine()
        engine.start()
        subs.push(
            engine.eventDispatcher.beforeUpdate.subscribe(() => {
                if (!activePiece) {
                    // TODO: piece selection
                    const pieceId = 0
                    activePiece = { pieceId, position: vec(0, 0), orientation: 0 }
                }
                if (engine.frameInfo.id % 10 === 0) {
                    activePiece.orientation = (activePiece.orientation + 1) % 4
                }
                if (engine.frameInfo.id % 40 === 0) {
                    activePiece.pieceId = (activePiece.pieceId + 1) % 7
                    activePiece.orientation = 0
                }
            })
        )
        subs.push(
            engine.eventDispatcher.beforeDraw.subscribe(() => {
                ctx.clear()
                drawBoard(board)
                drawActivePiece(activePiece!)
            })
        )
    })

    onCleanup(() => {
        subs.forEach(s => s.unsubscribe())
    })

    return (
        <div class="App">
            <canvas ref={canvas}></canvas>
        </div>
    )
}
