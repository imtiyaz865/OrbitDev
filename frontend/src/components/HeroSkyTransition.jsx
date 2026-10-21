import { useEffect, useRef, useState } from 'react'
import { useColorScheme, useTouchFirstDevice } from '../contexts/ColorSchemeContext.jsx'

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const trailFragmentShader = `
  uniform vec2 uResolution;
  uniform vec2 uPointer;
  uniform vec2 uPreviousPointer;
  uniform float uSpeed;
  uniform float uDelta;
  uniform float uDeposit;
  uniform float uTime;
  uniform sampler2D uPreviousMask;
  varying vec2 vUv;

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float noise21(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  void main() {
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 flow = vec2(
      noise21(vUv * 5.0 + uTime * 0.15),
      noise21(vUv * 5.0 + vec2(13.7, 4.2) - uTime * 0.13)
    ) - 0.5;
    vec2 previousUv = clamp(vUv + flow * min(uDelta, 0.05) * 0.008, 0.001, 0.999);
    float remainingTrail = texture2D(uPreviousMask, previousUv).r * exp(-uDelta / 2.1);

    vec2 point = vec2((vUv.x - uPointer.x) * aspect, vUv.y - uPointer.y);
    vec2 start = vec2((uPreviousPointer.x - uPointer.x) * aspect, uPreviousPointer.y - uPointer.y);
    vec2 segment = -start;
    float segmentLength = dot(segment, segment);
    float along = segmentLength > 0.000001
      ? clamp(dot(point - start, segment) / segmentLength, 0.0, 1.0)
      : 1.0;
    float distanceToPath = length(point - (start + segment * along));
    float radius = mix(0.09, 0.19, smoothstep(0.02, 1.0, uSpeed));
    float edgeNoise = noise21(vUv * vec2(7.0, 5.0) + uTime * vec2(0.19, -0.16));
    edgeNoise += noise21(vUv * vec2(15.0, 11.0) - uTime * vec2(0.16, 0.14)) * 0.26;
    float distortedDistance = distanceToPath + (edgeNoise - 0.58) * 0.065;
    float depositedTrail = (1.0 - smoothstep(radius - 0.012, radius + 0.012, distortedDistance)) * uDeposit;

    gl_FragColor = vec4(max(remainingTrail, depositedTrail), 0.0, 0.0, 1.0);
  }
`

const fragmentShader = `
  uniform vec2 uResolution;
  uniform vec2 uPointer;
  uniform float uActive;
  uniform float uTime;
  uniform float uFullNight;
  uniform sampler2D uTrailMask;
  varying vec2 vUv;

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float noise21(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  vec3 starLayer(vec2 uv, vec2 gridSize, float threshold, float seedOffset, float radiusMin, float radiusMax, float time) {
    vec2 gridPoint = uv * gridSize;
    vec2 cell = floor(gridPoint);
    vec2 cellOffset = fract(gridPoint);
    float seed = hash21(cell + seedOffset);
    vec2 starPosition = vec2(hash21(cell + seedOffset + 17.1), hash21(cell + seedOffset + 43.7));
    float orbitSpeed = 0.12 + hash21(cell + seedOffset + 61.3) * 0.2;
    vec2 orbit = vec2(
      sin(time * orbitSpeed + seed * 31.0),
      cos(time * orbitSpeed * 0.83 + seed * 47.0)
    ) * 0.13;
    vec2 starDelta = (cellOffset - starPosition) * gridSize - orbit;
    float radius = mix(radiusMin, radiusMax, hash21(cell + seedOffset + 91.4));
    float shape = 1.0 - smoothstep(radius * 0.34, radius, length(starDelta));
    float phase = time * (0.5 + seed * 1.6) + seed * 61.0;
    float twinkle = 0.76 + 0.24 * sin(phase);
    float glimmer = 1.0 + 0.22 * pow(max(0.0, sin(phase * 0.47 + seed * 8.0)), 12.0);
    float brightness = step(threshold, seed) * shape * twinkle * glimmer;
    return vec3(0.72, 0.86, 1.0) * brightness * (0.48 + 0.52 * hash21(cell + seedOffset + 6.3));
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 pointerSpace = vec2((uv.x - uPointer.x) * aspect, uv.y - uPointer.y);
    vec2 warp = vec2(
      noise21(uv * vec2(6.0, 4.8) + uTime * vec2(0.23, -0.18)),
      noise21(uv * vec2(5.2, 6.4) + vec2(7.3, 19.1) - uTime * vec2(0.16, 0.2))
    ) - 0.5;
    vec2 fineWarp = vec2(
      noise21(uv * vec2(10.0, 8.0) - uTime * vec2(0.29, 0.21)),
      noise21(uv * vec2(8.0, 11.0) + vec2(14.7, 3.2) + uTime * vec2(0.19, -0.26))
    ) - 0.5;
    vec2 warpedPointerSpace = pointerSpace + (warp * 0.82 + fineWarp * 0.32) * 0.18;
    float radiusNoise = noise21(uv * vec2(7.0, 5.0) + uTime * vec2(0.2, -0.16));
    radiusNoise += noise21(uv * vec2(14.0, 11.0) - uTime * vec2(0.17, 0.22)) * 0.32;
    float revealRadius = 0.3 + (radiusNoise - 0.66) * 0.09;
    float cursorReveal = (1.0 - smoothstep(revealRadius - 0.009, revealRadius + 0.009, length(warpedPointerSpace))) * uActive;
    float trailValue = uFullNight > 0.5 ? 0.0 : texture2D(uTrailMask, uv).r;
    float trailReveal = smoothstep(0.46, 0.7, trailValue);
    float mask = max(cursorReveal, trailReveal);

    float horizon = smoothstep(0.0, 1.0, uv.y);
    vec3 nightSky = mix(vec3(0.0015, 0.0025, 0.007), vec3(0.004, 0.012, 0.028), horizon);
    float atmosphere = pow(max(0.0, 1.0 - abs(uv.y - 0.34) * 2.5), 3.0);
    nightSky += vec3(0.003, 0.009, 0.019) * atmosphere;

    vec3 stars = starLayer(uv, vec2(94.0, 58.0), 0.77, 0.0, 0.7, 1.6, uTime);
    stars += starLayer(uv + vec2(uTime * 0.0008, -uTime * 0.0005), vec2(57.0, 36.0), 0.83, 29.7, 0.8, 2.0, uTime * 0.82);
    stars += starLayer(uv, vec2(138.0, 86.0), 0.965, 67.3, 1.2, 2.5, uTime * 1.17) * 1.2;
    mask = mix(mask, 1.0, uFullNight);

    gl_FragColor = vec4(nightSky + stars, mask);
    #include <colorspace_fragment>
  }
`

export function HeroSkyTransition() {
  const canvasRef = useRef(null)
  const { scheme } = useColorScheme()
  const touchFirst = useTouchFirstDevice()
  const [fallback, setFallback] = useState(false)
  const [fallbackNight, setFallbackNight] = useState(scheme === 'dark')

  useEffect(() => {
    const canvas = canvasRef.current
    const hero = canvas?.closest('.home-hero')
    if (!canvas || !hero) return

    const fullNight = scheme === 'dark'
    const interactive = !touchFirst && !fullNight
    setFallbackNight(fullNight)
    if (touchFirst && !fullNight) return

    let renderer
    let scene
    let camera
    let mesh
    let geometry
    let emptyTrailTexture
    let trailMaterial
    let displayMaterial
    let targets = []
    let readTarget = 0
    let writeTarget = 1
    let contextLostListener
    let contextRestoredListener
    let observer
    let resizeObserver
    let resizeListener
    let frame = 0
    let visible = true
    let disposed = false
    let failed = false
    let active = 0
    let targetActive = 0
    let lastFrame = 0
    let startTime = 0
    let animateUntil = 0
    let pointerX = 0.5
    let pointerY = 0.5
    let depositedX = 0.5
    let depositedY = 0.5
    let pointerSpeed = 0
    let lastPointerAt = 0
    let pointerInitialized = false
    let pendingDeposit = false
    let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    const updatePointer = (event, resetTrail = false) => {
      const bounds = hero.getBoundingClientRect()
      const nextX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
      const nextY = 1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
      const dx = (nextX - pointerX) * bounds.width / bounds.height
      const dy = nextY - pointerY
      const distance = Math.hypot(dx, dy)
      const now = performance.now()
      const elapsed = Math.max(1, now - lastPointerAt)

      if (!pointerInitialized || resetTrail) {
        depositedX = nextX
        depositedY = nextY
        pointerInitialized = true
        pendingDeposit = true
      } else if (distance > 0.0002) {
        pointerSpeed = Math.min(2, distance / (elapsed / 1000))
        pendingDeposit = true
      }

      pointerX = nextX
      pointerY = nextY
      lastPointerAt = now
      animateUntil = now + 9000
      canvas.parentElement?.style.setProperty('--sky-pointer-x', `${pointerX * 100}%`)
      canvas.parentElement?.style.setProperty('--sky-pointer-y', `${(1 - pointerY) * 100}%`)
      if (displayMaterial) displayMaterial.uniforms.uPointer.value.set(pointerX, pointerY)
    }

    const drawFallback = (isNight) => {
      if (failed) setFallbackNight(isNight)
    }

    const enter = (event) => {
      if (event.pointerType === 'touch') return
      updatePointer(event, true)
      targetActive = 1
      drawFallback(true)
      if (reducedMotion) {
        active = 1
        renderFrame(0, 0)
      } else {
        requestRender()
      }
    }

    const move = (event) => {
      if (event.pointerType === 'touch') return
      updatePointer(event)
      if (targetActive > 0 && !reducedMotion) requestRender()
      else if (reducedMotion) renderFrame(0, 0)
    }

    const leave = (event) => {
      if (event.pointerType === 'touch') return
      targetActive = 0
      animateUntil = performance.now() + 9000
      drawFallback(false)
      if (reducedMotion) {
        active = 0
        renderFrame(0, 0)
      } else {
        requestRender()
      }
    }

    if (interactive) {
      hero.addEventListener('pointerenter', enter)
      hero.addEventListener('pointermove', move)
      hero.addEventListener('pointerleave', leave)
    }

    const onMotionPreferenceChange = (event) => {
      reducedMotion = event.matches
      if (reducedMotion) {
        active = targetActive
        if (frame) cancelAnimationFrame(frame)
        frame = 0
        clearTargets()
        renderFrame(0, 0)
      } else if (visible && (fullNight || active !== targetActive || active > 0)) {
        requestRender()
      }
    }
    mediaQuery.addEventListener?.('change', onMotionPreferenceChange)

    function renderFrame(time, delta) {
      if (!renderer || !mesh || !displayMaterial || !visible || disposed) return

      if (interactive && !reducedMotion && trailMaterial && targets.length === 2) {
        trailMaterial.uniforms.uPreviousMask.value = targets[readTarget].texture
        trailMaterial.uniforms.uPointer.value.set(pointerX, pointerY)
        trailMaterial.uniforms.uPreviousPointer.value.set(depositedX, depositedY)
        trailMaterial.uniforms.uSpeed.value = pointerSpeed
        trailMaterial.uniforms.uDelta.value = delta
        trailMaterial.uniforms.uDeposit.value = pendingDeposit ? 1 : 0
        trailMaterial.uniforms.uTime.value = time

        mesh.material = trailMaterial
        renderer.setRenderTarget(targets[writeTarget])
        renderer.render(scene, camera)
        renderer.setRenderTarget(null)
        ;[readTarget, writeTarget] = [writeTarget, readTarget]
        if (pendingDeposit) {
          depositedX = pointerX
          depositedY = pointerY
          pendingDeposit = false
        }
        pointerSpeed = 0
      }

      displayMaterial.uniforms.uPointer.value.set(pointerX, pointerY)
      displayMaterial.uniforms.uActive.value = active
      displayMaterial.uniforms.uTime.value = time
      displayMaterial.uniforms.uFullNight.value = fullNight ? 1 : 0
      displayMaterial.uniforms.uTrailMask.value = targets.length === 2
        ? targets[reducedMotion ? 0 : readTarget].texture
        : emptyTrailTexture
      mesh.material = displayMaterial
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
    }

    function animate(now) {
      frame = 0
      if (disposed || !visible || !renderer || !displayMaterial) return
      if (now - lastFrame < 1000 / 30) {
        frame = requestAnimationFrame(animate)
        return
      }

      const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 1 / 30
      lastFrame = now
      active += (targetActive - active) * (1 - Math.exp(-delta / 0.16))
      if (Math.abs(targetActive - active) < 0.001) active = targetActive
      renderFrame((now - startTime) / 1000, delta)

      if (fullNight || Math.abs(targetActive - active) > 0.001 || active > 0.001 || now < animateUntil) {
        frame = requestAnimationFrame(animate)
      } else {
        clearTargets()
        renderFrame((now - startTime) / 1000, 0)
      }
    }

    function requestRender() {
      if (!visible || reducedMotion || frame || !renderer) return
      frame = requestAnimationFrame(animate)
    }

    function clearTargets() {
      if (!renderer || targets.length !== 2) return
      renderer.setClearColor(0x000000, 0)
      for (const target of targets) {
        renderer.setRenderTarget(target)
        renderer.clear(true, false, false)
      }
      renderer.setRenderTarget(null)
      readTarget = 0
      writeTarget = 1
    }

    function resize() {
      if (!renderer) return
      const bounds = hero.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25)
      const width = Math.max(1, Math.floor(bounds.width))
      const height = Math.max(1, Math.floor(bounds.height))
      const maskWidth = Math.max(128, Math.floor(width * pixelRatio * 0.55))
      const maskHeight = Math.max(96, Math.floor(height * pixelRatio * 0.55))

      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(width, height, false)
      displayMaterial.uniforms.uResolution.value.set(width, height)
      trailMaterial.uniforms.uResolution.value.set(width, height)
      for (const target of targets) target.setSize(maskWidth, maskHeight)
      clearTargets()
      renderFrame(0, 0)
    }

    function releaseGraphics() {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      observer?.disconnect()
      resizeObserver?.disconnect()
      if (resizeListener) window.removeEventListener('resize', resizeListener)
      if (contextLostListener) canvas.removeEventListener('webglcontextlost', contextLostListener)
      if (contextRestoredListener) canvas.removeEventListener('webglcontextrestored', contextRestoredListener)
      geometry?.dispose()
      emptyTrailTexture?.dispose()
      trailMaterial?.dispose()
      displayMaterial?.dispose()
      targets.forEach((target) => target.dispose())
      renderer?.dispose()
      geometry = undefined
      trailMaterial = undefined
      displayMaterial = undefined
      targets = []
      renderer = undefined
    }

    async function initialize() {
      try {
        const THREE = await import('three')
        if (disposed) return
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: false,
          powerPreference: 'low-power',
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25))
        renderer.setClearColor(0x000000, 0)
        renderer.outputColorSpace = THREE.SRGBColorSpace
        scene = new THREE.Scene()
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
        geometry = new THREE.PlaneGeometry(2, 2)
        emptyTrailTexture = new THREE.DataTexture(
          new Uint8Array([0, 0, 0, 255]),
          1,
          1,
          THREE.RGBAFormat,
        )
        emptyTrailTexture.colorSpace = THREE.NoColorSpace
        emptyTrailTexture.needsUpdate = true
        trailMaterial = new THREE.ShaderMaterial({
          uniforms: {
            uResolution: { value: new THREE.Vector2(1, 1) },
            uPointer: { value: new THREE.Vector2(pointerX, pointerY) },
            uPreviousPointer: { value: new THREE.Vector2(depositedX, depositedY) },
            uSpeed: { value: 0 },
            uDelta: { value: 0 },
            uDeposit: { value: 0 },
            uTime: { value: 0 },
            uPreviousMask: { value: null },
          },
          vertexShader,
          fragmentShader: trailFragmentShader,
          depthTest: false,
          depthWrite: false,
        })
        displayMaterial = new THREE.ShaderMaterial({
          uniforms: {
            uResolution: { value: new THREE.Vector2(1, 1) },
            uPointer: { value: new THREE.Vector2(pointerX, pointerY) },
            uActive: { value: 0 },
            uTime: { value: 0 },
            uFullNight: { value: fullNight ? 1 : 0 },
            uTrailMask: { value: emptyTrailTexture },
          },
          vertexShader,
          fragmentShader,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        })
        mesh = new THREE.Mesh(geometry, displayMaterial)
        scene.add(mesh)

        const targetOptions = {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          depthBuffer: false,
          stencilBuffer: false,
          generateMipmaps: false,
        }
        targets = interactive ? [
          new THREE.WebGLRenderTarget(1, 1, targetOptions),
          new THREE.WebGLRenderTarget(1, 1, targetOptions),
        ] : []
        targets.forEach((target) => { target.texture.colorSpace = THREE.NoColorSpace })

        contextLostListener = (event) => {
          event.preventDefault()
          failed = true
          setFallback(true)
          setFallbackNight(fullNight || targetActive > 0)
          releaseGraphics()
        }
        contextRestoredListener = () => {
          if (!disposed) {
            failed = true
            setFallback(true)
            setFallbackNight(fullNight || targetActive > 0)
          }
        }
        canvas.addEventListener('webglcontextlost', contextLostListener)
        canvas.addEventListener('webglcontextrestored', contextRestoredListener, { once: true })

        if ('ResizeObserver' in window) {
          resizeObserver = new ResizeObserver(resize)
          resizeObserver.observe(hero)
        } else {
          resizeListener = resize
          window.addEventListener('resize', resizeListener)
        }

        if ('IntersectionObserver' in window) {
          observer = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            if (visible && (fullNight || active > 0 || targetActive > 0 || pendingDeposit)) requestRender()
            if (!visible && frame) {
              cancelAnimationFrame(frame)
              frame = 0
            }
          })
          observer.observe(hero)
        }

        if (interactive) resize()
        else {
          const bounds = hero.getBoundingClientRect()
          renderer.setSize(Math.max(1, Math.floor(bounds.width)), Math.max(1, Math.floor(bounds.height)), false)
          displayMaterial.uniforms.uResolution.value.set(bounds.width, bounds.height)
        }
        startTime = performance.now()
        if (reducedMotion) {
          active = fullNight ? 1 : targetActive
          renderFrame(0, 0)
        } else if (fullNight || targetActive > 0 || pendingDeposit) {
          requestRender()
        }
      } catch (error) {
        failed = true
        releaseGraphics()
        if (!disposed) {
          setFallback(true)
          setFallbackNight(fullNight || targetActive > 0)
          console.error('Hero sky shader could not initialize; using the CSS fallback.', error)
        }
      }
    }

    initialize()
    return () => {
      disposed = true
      if (interactive) {
        hero.removeEventListener('pointerenter', enter)
        hero.removeEventListener('pointermove', move)
        hero.removeEventListener('pointerleave', leave)
      }
      mediaQuery.removeEventListener?.('change', onMotionPreferenceChange)
      releaseGraphics()
    }
  }, [scheme, touchFirst])

  return (
    <div className={`hero-sky-transition${fallback ? ' is-fallback' : ''}${touchFirst && scheme === 'light' ? ' is-static-day' : ''}`} aria-hidden="true">
      <canvas ref={canvasRef} className="hero-sky-canvas" />
      <div className={`hero-sky-fallback${fallbackNight ? ' is-night' : ''}${scheme === 'dark' ? ' is-full-night' : ''}`} />
    </div>
  )
}
