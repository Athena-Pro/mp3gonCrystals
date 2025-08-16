import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

function AppStub(){ return <h1>Hello</h1> }
describe('smoke', () => {
  it('renders', () => {
    render(<AppStub />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
