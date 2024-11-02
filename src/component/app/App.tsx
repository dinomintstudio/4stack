import { Engine, Vector, vec } from '@vole-engine/core'
import { Context } from '@vole-engine/draw'
import { Subscription } from 'rxjs'
import { type Component, onCleanup, onMount } from 'solid-js'
import './App.module.scss'

export const createOrientations = (desc: PieceDescription): PieceOrientationState => {
    const orientation = { blocs: desc.blocs }
    if (desc.rotationMode === 'off') return { orientations: [orientation, orientation, orientation, orientation] }
    const offset = desc.rotationMode === 'between' ? 1 : 0
    const cw = { blocs: orientation.blocs.map(b => rotateCw(b)) }
    const cw2 = { blocs: cw.blocs.map(b => rotateCw(b)) }
    const cw3 = { blocs: cw2.blocs.map(b => rotateCw(b)) }

    switch (desc.rotationMode) {
        case 'normal':
            return { orientations: [orientation, cw, cw2, cw3] }
        case 'between':
            return {
                orientations: [
                    orientation,
                    { blocs: cw.blocs.map(b => b.add(vec(1, 0).scale(offset))) },
                    { blocs: cw2.blocs.map(b => b.add(vec(1, -1).scale(offset))) },
                    { blocs: cw3.blocs.map(b => b.add(vec(0, -1).scale(offset))) }
                ]
            }
    }
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
        blocs: [vec(0, 0), vec(0, 1), vec(1, 0), vec(-1, 0)],
        rotationMode: 'normal'
    },
    {
        // S piece
        blocs: [vec(0, 0), vec(-1, 0), vec(0, 1), vec(1, 1)],
        rotationMode: 'normal'
    },
    {
        // Z piece
        blocs: [vec(0, 0), vec(1, 0), vec(0, 1), vec(-1, 1)],
        rotationMode: 'normal'
    },
    {
        // J piece
        blocs: [vec(0, 0), vec(-1, 1), vec(-1, 0), vec(1, 0)],
        rotationMode: 'normal'
    },
    {
        // L piece
        blocs: [vec(0, 0), vec(1, 1), vec(1, 0), vec(-1, 0)],
        rotationMode: 'normal'
    }
]

export const pieces: PieceOrientationState[] = piecesDescription.map(createOrientations)

export const gameConfig = {
    boardSize: vec(10, 20),
    blockScreenSize: vec(40, 40),
    colors: [
        'transparent',
        '#333333',
        '#555555',
        '#25e4f4',
        '#fded02',
        '#af20fe',
        '#01a252',
        '#db2d20',
        '#0160f4',
        '#ee6522'
    ]
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

    const boardToScreen = (v: Vector): Vector => {
        const screenSize = vec(canvas.width, canvas.height)
        const screenCenter = screenSize.scale(0.5)
        const blockSize = gameConfig.blockScreenSize
        const boardSize = gameConfig.boardSize.add(vec(0, 2)).scale(blockSize)
        const boardCenter = boardSize.scale(0.5)
        return v.add(vec(0.5, 0.5)).scale(blockSize).add(boardCenter.negate()).scale(vec(1, -1)).add(screenCenter)
    }

    const drawBoard = (board: Board): void => {
        const gridOpts = { fill: gameConfig.colors[0], stroke: gameConfig.colors[1] }

        for (let i = 0; i < gameConfig.boardSize.x; i++) {
            for (let j = 0; j < gameConfig.boardSize.y; j++) {
                const pos = boardToScreen(vec(i, j))
                ctx.rect(pos, gameConfig.blockScreenSize, gridOpts)
            }
        }

        // TODO: draw board
    }

    const drawActivePiece = (activePiece: ActivePiece): void => {
        const opts = { fill: gameConfig.colors[activePiece.pieceId + 3], stroke: gameConfig.colors[1] }

        pieces[activePiece.pieceId].orientations[activePiece.orientation].blocs.forEach(block => {
            const pos = activePiece.position.add(block)
            ctx.rect(boardToScreen(pos), gameConfig.blockScreenSize, opts)
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
                    const spawnPos = vec(Math.floor(gameConfig.boardSize.x / 2) - 1, gameConfig.boardSize.y)
                    // TODO: piece selection
                    activePiece = { pieceId: 0, position: spawnPos, orientation: 0 }
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
            <canvas ref={canvas} />
        </div>
    )
}
