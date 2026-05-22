import { describe, expect, it } from 'vitest'
import { filterLocalLogoLibrary } from '../../../src/utils/logo-library'

const sampleLibrary = [
  {
    label: 'GitHub',
    logoUrl: '/static/logos/github.png',
    source: 'local',
    filename: 'github.png',
    relatedSubscriptionNames: ['GitHub Pro']
  },
  {
    label: 'Netflix',
    logoUrl: '/static/logos/netflix.png',
    source: 'upload',
    filename: 'streaming-netflix.png',
    relatedSubscriptionNames: ['Family Streaming']
  }
]

describe('logo library filter', () => {
  it('returns all local logos when the keyword is empty', () => {
    expect(filterLocalLogoLibrary(sampleLibrary, '')).toEqual(sampleLibrary)
  })

  it('filters local logos by label, source, filename, and related subscription names', () => {
    expect(filterLocalLogoLibrary(sampleLibrary, 'git')).toEqual([sampleLibrary[0]])
    expect(filterLocalLogoLibrary(sampleLibrary, 'upload')).toEqual([sampleLibrary[1]])
    expect(filterLocalLogoLibrary(sampleLibrary, 'streaming-netflix')).toEqual([sampleLibrary[1]])
    expect(filterLocalLogoLibrary(sampleLibrary, 'pro')).toEqual([sampleLibrary[0]])
  })
})
