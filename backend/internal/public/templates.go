package public

import "html/template"

// layout wraps every public page. Open Graph tags make WhatsApp and other apps show a rich
// preview card when a link is shared.
const layout = `{{define "layout"}}<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{.Title}}</title>
<meta name="description" content="{{.Description}}">
<meta property="og:title" content="{{.Title}}">
<meta property="og:description" content="{{.Description}}">
<meta property="og:image" content="{{.BaseURL}}/static/logo.png">
<meta property="og:type" content="website">
{{if .URL}}<meta property="og:url" content="{{.URL}}">{{end}}
<link rel="icon" href="/static/logo.png">
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;padding:1.5rem 1rem 3rem;line-height:1.5;color:#e8efe9;background:#071A10}
a{color:#f2c14e}h1{font-size:1.6rem;margin:.5rem 0}h2{font-size:1.15rem;margin-top:1.75rem}
.brand{display:flex;align-items:center;gap:.6rem;font-weight:700;letter-spacing:.3px}
.brand img{width:40px;height:40px;border-radius:10px}
.card{background:#0e2a1b;border:1px solid #1d4430;border-radius:14px;padding:1rem;margin:1rem 0}
.score{display:flex;justify-content:space-between;align-items:center;font-size:1.25rem;font-weight:700}
.big{font-size:2rem}.muted{color:#9fb6a6;font-size:.9rem}.win{color:#f2c14e}
table{width:100%;border-collapse:collapse}td,th{padding:.45rem .3rem;text-align:left;border-bottom:1px solid #1d4430}
th{color:#9fb6a6;font-weight:600;font-size:.85rem}td.n,th.n{text-align:right}
.cta{display:inline-block;margin-top:1rem;background:#f2c14e;color:#071A10;padding:.7rem 1.1rem;border-radius:999px;font-weight:700;text-decoration:none}
textarea,input{width:100%;box-sizing:border-box;padding:.6rem;border-radius:8px;border:1px solid #1d4430;background:#0e2a1b;color:#e8efe9;font:inherit}
button{margin-top:.6rem;background:#f2c14e;color:#071A10;border:0;padding:.6rem 1rem;border-radius:999px;font-weight:700;font:inherit}
</style></head><body>
<div class="brand"><img src="/static/logo.png" alt=""><span>Snookit</span></div>
{{template "body" .}}
<p class="muted" style="margin-top:2.5rem"><a href="/terms">Community rules</a> &middot; <a href="/privacy">Privacy</a> &middot; <a href="/delete-account">Delete account</a></p>
</body></html>{{end}}`

const matchBody = `{{define "body"}}
<h1>{{.Data.Label}}</h1>
<p class="muted">{{.Data.League}} &middot; {{.Data.When}}{{if .Data.Live}} &middot; <b class="win">LIVE</b>{{end}}</p>
<div class="card">
  <div class="score"><span class="{{if eq .Data.Winner "a"}}win{{end}}">{{.Data.SideA}}</span><span class="big">{{.Data.FramesA}} - {{.Data.FramesB}}</span><span class="{{if eq .Data.Winner "b"}}win{{end}}">{{.Data.SideB}}</span></div>
  {{if .Data.Status}}<p class="muted">{{.Data.Status}}</p>{{end}}
</div>
{{if .Data.Frames}}<h2>Frames</h2><table><tr><th>#</th><th class="n">{{.Data.SideA}}</th><th class="n">{{.Data.SideB}}</th></tr>
{{range $i, $f := .Data.Frames}}<tr><td>{{$f.Number}}</td><td class="n {{if eq $f.Winner "a"}}win{{end}}">{{$f.A}}</td><td class="n {{if eq $f.Winner "b"}}win{{end}}">{{$f.B}}</td></tr>{{end}}</table>{{end}}
<a class="cta" href="{{.AppURL}}">Score your own matches with Snookit</a>
<h2>Is this you?</h2>
<p class="muted">If you played in this match and don't want your name shown, ask us to remove it.</p>
<form method="post" action="/remove-request"><input type="hidden" name="target" value="match:{{.Data.ID}}">
<textarea name="message" rows="2" maxlength="500" placeholder="Which name is yours? (optional)"></textarea>
<button type="submit">This is me, remove it</button></form>
{{end}}`

const playerBody = `{{define "body"}}
<h1>{{.Data.Name}}</h1>
<p class="muted">{{if .Data.City}}{{.Data.City}}{{end}}{{if .Data.Division}} &middot; {{.Data.Division}}{{end}}</p>
<div class="card"><table>
<tr><td>Matches played</td><td class="n">{{.Data.Played}}</td></tr>
<tr><td>Win rate</td><td class="n">{{.Data.WinPct}}%</td></tr>
<tr><td>Titles</td><td class="n">{{.Data.Titles}}</td></tr>
<tr><td>Highest break</td><td class="n">{{.Data.HighestBreak}}</td></tr>
<tr><td>Centuries</td><td class="n">{{.Data.Centuries}}</td></tr>
</table></div>
<a class="cta" href="{{.AppURL}}">Follow and challenge on Snookit</a>
{{end}}`

const cityBody = `{{define "body"}}
<h1>Best snooker players in {{.Data.City}}</h1>
<p class="muted">Ranked by win rate and experience (at least 3 matches).</p>
{{if .Data.Rows}}<table><tr><th>#</th><th>Player</th><th class="n">Played</th><th class="n">Win %</th></tr>
{{range .Data.Rows}}<tr><td>{{.Rank}}</td><td><a href="/p/{{.UID}}">{{.Name}}</a></td><td class="n">{{.Played}}</td><td class="n">{{.WinPct}}</td></tr>{{end}}</table>
{{else}}<div class="card">No ranked players yet. Be the first.</div>{{end}}
<a class="cta" href="{{.AppURL}}">Join your city on Snookit</a>
{{end}}`

const tournamentBody = `{{define "body"}}
<h1>{{.Data.Name}}</h1>
<p class="muted">{{.Data.League}} &middot; {{.Data.Status}}</p>
{{range .Data.Rounds}}<h2>{{.Name}}</h2>
{{range .Matches}}<div class="card"><div class="score"><span class="{{if eq .Winner "a"}}win{{end}}">{{.SideA}}</span><span>{{.Score}}</span><span class="{{if eq .Winner "b"}}win{{end}}">{{.SideB}}</span></div></div>{{end}}
{{end}}
{{if .Data.Champion}}<div class="card"><b class="win">Champion: {{.Data.Champion}}</b></div>{{end}}
<a class="cta" href="{{.AppURL}}">Run your own tournament with Snookit</a>
{{end}}`

const messageBody = `{{define "body"}}<h1>{{.Data.Heading}}</h1>{{range .Data.Paragraphs}}<p>{{.}}</p>{{end}}{{end}}`

func page(body string) *template.Template {
	return template.Must(template.Must(template.New("layout").Parse(layout)).Parse(body))
}

var (
	matchPage      = page(matchBody)
	playerPage     = page(playerBody)
	cityPage       = page(cityBody)
	tournamentPage = page(tournamentBody)
	messagePage    = page(messageBody)
)
