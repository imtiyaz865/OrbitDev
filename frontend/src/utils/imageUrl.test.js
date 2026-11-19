import assert from 'node:assert/strict'
import test from 'node:test'
import { safeImageUrl, sizedImageUrl } from './imageUrl.js'

const luma = 'https://images.lumacdn.com/cdn-cgi/image/format=auto,fit=cover,dpr=1,anim=false,background=white,quality=75,width=1920,height=1920/uploads/ab/cover.png'
const lumaSocial = 'https://images.lumacdn.com/cdn-cgi/image/format=auto,fit=cover,dpr=1,anim=false,background=white,quality=75,width=800,height=420/event-social/x.png'

test('requests a smaller Luma rendition with the same crop and aspect ratio', () => {
  assert.equal(
    sizedImageUrl(luma, 800),
    'https://images.lumacdn.com/cdn-cgi/image/format=auto,fit=cover,dpr=1,anim=false,background=white,quality=75,width=800,height=800/uploads/ab/cover.png',
  )
  assert.equal(sizedImageUrl(lumaSocial, 400), lumaSocial.replace('width=800,height=420', 'width=400,height=210'))
})

test('never upsizes and leaves other hosts untouched', () => {
  assert.equal(sizedImageUrl(lumaSocial, 1600), lumaSocial)
  const meetup = 'https://secure-content.meetupstatic.com/images/classic-events/536941246/676x676.jpg'
  assert.equal(sizedImageUrl(meetup, 200), meetup)
  assert.equal(sizedImageUrl(luma, undefined), luma)
})

test('rejects unsafe image URLs', () => {
  assert.equal(safeImageUrl('javascript:alert(1)'), null)
  assert.equal(safeImageUrl('https://user:pass@example.com/a.png'), null)
  assert.equal(safeImageUrl(''), null)
  assert.equal(sizedImageUrl('data:image/png;base64,AAAA', 100), null)
})
