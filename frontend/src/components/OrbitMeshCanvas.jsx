import { useEffect, useRef, useState } from 'react'

function createMeshData(columns, rows) {
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3)
  const indices = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column
      const b = a + 1
      const c = a + columns + 1
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  const edges = []
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const first = row * (columns + 1) + column
      edges.push(first, first + 1)
    }
  }
  for (let column = 0; column <= columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const first = row * (columns + 1) + column
      edges.push(first, first + columns + 1)
    }
  }
  return { positions, indices, edges: new Uint32Array(edges) }
}

export default function OrbitMeshCanvas() {
  const canvasRef = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    if (!canvas || !host) return

    let renderer
    let frame = 0
    let observer
    let resizeObserver
    let resizeListener
    let removeListeners = () => {}
    let visible = true
    let contextLost = false
    let disposed = false
    let scene
    let camera
    let field
    let surfaceGeometry
    let wireGeometry
    let surfaceMaterial
    let wireMaterial
    let targetX = 0
    let targetY = 0
    let activeX = 0
    let activeY = 0
    let pointerDown = false
    let startTime = 0
    let lastFrame = 0
    let width = 0
    let height = 0

    function releaseGraphics() {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      observer?.disconnect()
      resizeObserver?.disconnect()
      if (resizeListener) window.removeEventListener('resize', resizeListener)
      removeListeners()
      surfaceGeometry?.dispose()
      wireGeometry?.dispose()
      surfaceMaterial?.dispose()
      wireMaterial?.dispose()
      renderer?.dispose()
    }

    async function initialize() {
      try {
        const THREE = await import('three')
        if (disposed) return
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
        renderer.setClearColor(0x000000, 0)
        scene = new THREE.Scene()
        camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100)
        camera.position.set(0, 0.7, 9.6)
        scene.add(new THREE.HemisphereLight(0xffffff, 0x6fa9c2, 2.2))
        const light = new THREE.DirectionalLight(0xffffff, 2.4)
        light.position.set(-3, 5, 6)
        scene.add(light)
        field = new THREE.Group()
        scene.add(field)

        const columns = 58
        const rows = 36
        const meshData = createMeshData(columns, rows)
        surfaceGeometry = new THREE.BufferGeometry()
        surfaceGeometry.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3).setUsage(THREE.DynamicDrawUsage))
        surfaceGeometry.setIndex(meshData.indices)
        surfaceMaterial = new THREE.MeshPhongMaterial({
          color: 0x8bd8f4,
          side: THREE.DoubleSide,
          shininess: 70,
          transparent: true,
          opacity: 0.68,
        })
        field.add(new THREE.Mesh(surfaceGeometry, surfaceMaterial))

        const wirePositions = new Float32Array(meshData.edges.length * 3)
        wireGeometry = new THREE.BufferGeometry()
        wireGeometry.setAttribute('position', new THREE.BufferAttribute(wirePositions, 3).setUsage(THREE.DynamicDrawUsage))
        wireMaterial = new THREE.LineBasicMaterial({ color: 0x146b91, transparent: true, opacity: 0.8 })
        field.add(new THREE.LineSegments(wireGeometry, wireMaterial))

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const pointerMove = (event) => {
          if (event.pointerType === 'touch' && !pointerDown) return
          const bounds = canvas.getBoundingClientRect()
          targetY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.58
          targetX = ((event.clientY - bounds.top) / bounds.height - 0.5) * -0.36
        }
        const pointerLeave = () => {
          if (pointerDown) return
          targetX = 0
          targetY = 0
        }
        const pointerStart = (event) => {
          if (event.pointerType === 'touch') pointerDown = true
        }
        const pointerEnd = () => {
          pointerDown = false
          targetX = 0
          targetY = 0
        }
        const keyMove = (event) => {
          const directions = {
            ArrowUp: [-0.12, 0],
            ArrowDown: [0.12, 0],
            ArrowLeft: [0, -0.16],
            ArrowRight: [0, 0.16],
          }
          const direction = directions[event.key]
          if (!direction) return
          event.preventDefault()
          targetX = Math.max(-0.36, Math.min(0.36, targetX + direction[0]))
          targetY = Math.max(-0.58, Math.min(0.58, targetY + direction[1]))
        }
        canvas.addEventListener('pointermove', pointerMove)
        canvas.addEventListener('pointerleave', pointerLeave)
        canvas.addEventListener('pointerdown', pointerStart)
        canvas.addEventListener('pointerup', pointerEnd)
        canvas.addEventListener('pointercancel', pointerEnd)
        canvas.addEventListener('keydown', keyMove)
        const lostContext = (event) => {
          event.preventDefault()
          contextLost = true
          releaseGraphics()
          setFailed(true)
        }
        canvas.addEventListener('webglcontextlost', lostContext)
        removeListeners = () => {
          canvas.removeEventListener('pointermove', pointerMove)
          canvas.removeEventListener('pointerleave', pointerLeave)
          canvas.removeEventListener('pointerdown', pointerStart)
          canvas.removeEventListener('pointerup', pointerEnd)
          canvas.removeEventListener('pointercancel', pointerEnd)
          canvas.removeEventListener('keydown', keyMove)
          canvas.removeEventListener('webglcontextlost', lostContext)
        }

        const resize = () => {
          const bounds = host.getBoundingClientRect()
          width = Math.max(1, Math.floor(bounds.width))
          height = Math.max(1, Math.floor(bounds.height))
          renderer.setSize(width, height, false)
          camera.aspect = width / height
          camera.position.z = width < 500 ? 10.8 : 9.6
          camera.updateProjectionMatrix()
          renderer.render(scene, camera)
        }
        resize()
        if ('ResizeObserver' in window) {
          resizeObserver = new ResizeObserver(resize)
          resizeObserver.observe(host)
        } else {
          resizeListener = resize
          window.addEventListener('resize', resizeListener)
        }
        startTime = performance.now()

        function animate(now) {
          frame = 0
          if (disposed || contextLost || !visible) return
          if (now - lastFrame < 1000 / 30) {
            frame = requestAnimationFrame(animate)
            return
          }
          lastFrame = now
          const elapsed = reducedMotion ? 0 : (now - startTime) * 0.001
          const positions = surfaceGeometry.attributes.position.array
          const cols = columns + 1
          for (let row = 0; row <= rows; row += 1) {
            const z = (row / rows - 0.5) * 3.1
            for (let column = 0; column <= columns; column += 1) {
              const x = (column / columns - 0.5) * 6.8
              const dx = x / 3.4 - targetY * 1.8
              const dz = z / 1.55 + targetX * 1.8
              const influence = Math.exp(-(dx * dx + dz * dz) * 2.2)
              const wave = Math.sin(x * 1.18 + elapsed * 0.7) * Math.cos(z * 1.65 - elapsed * 0.48) * 0.32
                + Math.sin(z * 2.3 + elapsed * 0.34) * 0.11
              const index = (row * cols + column) * 3
              positions[index] = x
              positions[index + 1] = wave + influence * 0.37
              positions[index + 2] = z
            }
          }
          surfaceGeometry.attributes.position.needsUpdate = true
          surfaceGeometry.computeVertexNormals()
          const wirePositions = wireGeometry.attributes.position.array
          const edgePairs = meshData.edges
          for (let i = 0; i < edgePairs.length; i += 1) {
            const source = edgePairs[i] * 3
            const target = i * 3
            wirePositions[target] = positions[source]
            wirePositions[target + 1] = positions[source + 1]
            wirePositions[target + 2] = positions[source + 2]
          }
          wireGeometry.attributes.position.needsUpdate = true

          activeX += (targetX - activeX) * 0.055
          activeY += (targetY - activeY) * 0.055
          field.rotation.x = activeX + Math.sin(elapsed * 0.24) * 0.035
          field.rotation.y = activeY + Math.sin(elapsed * 0.18) * 0.12
          field.rotation.z = Math.sin(elapsed * 0.16) * 0.025
          field.position.y = -0.05 + Math.sin(elapsed * 0.45) * 0.07
          renderer.render(scene, camera)
          frame = requestAnimationFrame(animate)
        }

        if (!reducedMotion) frame = requestAnimationFrame(animate)
        else {
          const positions = surfaceGeometry.attributes.position.array
          const cols = columns + 1
          for (let row = 0; row <= rows; row += 1) {
            const z = (row / rows - 0.5) * 3.1
            for (let column = 0; column <= columns; column += 1) {
              const x = (column / columns - 0.5) * 6.8
              const index = (row * cols + column) * 3
              positions[index] = x
              positions[index + 1] = Math.sin(x * 1.18) * Math.cos(z * 1.65) * 0.32 + Math.sin(z * 2.3) * 0.11
              positions[index + 2] = z
            }
          }
          surfaceGeometry.attributes.position.needsUpdate = true
          surfaceGeometry.computeVertexNormals()
          const edges = meshData.edges
          const wirePositions = wireGeometry.attributes.position.array
          for (let i = 0; i < edges.length; i += 1) {
            const source = edges[i] * 3
            const target = i * 3
            wirePositions[target] = positions[source]
            wirePositions[target + 1] = positions[source + 1]
            wirePositions[target + 2] = positions[source + 2]
          }
          wireGeometry.attributes.position.needsUpdate = true
          renderer.render(scene, camera)
        }

        if ('IntersectionObserver' in window) {
          observer = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            if (visible && !reducedMotion && !frame) frame = requestAnimationFrame(animate)
            if (!visible && frame) {
              cancelAnimationFrame(frame)
              frame = 0
            }
          }, { threshold: 0 })
          observer.observe(host)
        }
      } catch (error) {
        releaseGraphics()
        if (!disposed) {
          console.error('ORBIT interactive field could not initialize; showing the static fallback.', error)
          setFailed(true)
        }
      }
    }

    initialize()
    return () => {
      disposed = true
      releaseGraphics()
    }
  }, [])

  return failed
    ? <div className="orbit-field-fallback" role="img" aria-label="A flowing abstract mesh in ORBIT's colors" />
    : <canvas ref={canvasRef} className="orbit-mesh-canvas" tabIndex={0} aria-label="Interactive three-dimensional mesh. Use pointer, touch, or arrow keys to move the field." />
}
