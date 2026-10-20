import { Component } from 'react'

// Se uma tela quebrar, mostra o erro e um caminho de volta em vez de deixar o app em tela preta.
// Os dados ficam no aparelho; voltar ou recarregar não perde nada.
export default class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }) }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 px-6 py-16 text-center" role="alert">
        <div className="font-display text-2xl font-extrabold text-accent">Algo deu errado nesta tela</div>
        <p className="text-sm text-muted">Seus dados estão salvos no aparelho. Volte e tente de novo; se repetir, mande um print desta tela.</p>
        <pre className="max-h-40 overflow-auto rounded-xl border-2 border-line bg-surface p-3 text-left font-mono text-xs whitespace-pre-wrap text-ng">{String(error?.message || error)}</pre>
        <button className="min-h-12 rounded-xl border-2 border-accent bg-accent font-display font-bold text-accent-ink" onClick={() => history.back()}>Voltar</button>
        <button className="min-h-12 rounded-xl border-2 border-line font-display font-bold" onClick={() => { location.hash = '#/'; location.reload() }}>Ir para os projetos</button>
      </div>
    )
  }
}
