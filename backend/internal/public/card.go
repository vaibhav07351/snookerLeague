package public

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log/slog"
	"net/http"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"
	"golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"

	syncmod "github.com/vaibhav/snookit-server/internal/sync"
)

// The result card is the picture WhatsApp and other apps show for a shared result link:
// 1200x630, the size link previews expect. It uses the same colours as the public pages.
const (
	cardW   = 1200
	cardH   = 630
	cardPad = 64
)

var (
	cardBg     = color.RGBA{0x07, 0x1A, 0x10, 0xff}
	cardPanel  = color.RGBA{0x0e, 0x2a, 0x1b, 0xff}
	cardLine   = color.RGBA{0x1d, 0x44, 0x30, 0xff}
	cardText   = color.RGBA{0xe8, 0xef, 0xe9, 0xff}
	cardMuted  = color.RGBA{0x9f, 0xb6, 0xa6, 0xff}
	cardGold   = color.RGBA{0xf2, 0xc1, 0x4e, 0xff}
	cardAccent = image.NewUniform(cardGold)
)

// cardFonts are parsed once; a font.Face is made per render because faces are not safe for
// concurrent use.
var cardFonts = sync.OnceValues(func() (fonts [2]*opentype.Font, err error) {
	if fonts[0], err = opentype.Parse(goregular.TTF); err != nil {
		return fonts, fmt.Errorf("parse regular font: %w", err)
	}
	if fonts[1], err = opentype.Parse(gobold.TTF); err != nil {
		return fonts, fmt.Errorf("parse bold font: %w", err)
	}
	return fonts, nil
})

// cardLogo is the app logo, decoded once.
var cardLogo = sync.OnceValues(func() (image.Image, error) {
	raw, err := static.ReadFile("static/logo.png")
	if err != nil {
		return nil, fmt.Errorf("read logo: %w", err)
	}
	img, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("decode logo: %w", err)
	}
	return img, nil
})

// cardVersion changes whenever the result changes, so a preview cached by a chat app is
// refreshed after a live game moves on.
func cardVersion(res Result) string {
	sum := sha256.Sum256([]byte(res.UpdatedAt + "|" + res.ID))
	return hex.EncodeToString(sum[:4])
}

// canvas draws text onto the card.
type canvas struct {
	img   *image.RGBA
	fonts [2]*opentype.Font
	faces map[[2]int]font.Face
}

func (c *canvas) face(bold bool, size int) (font.Face, error) {
	idx := 0
	if bold {
		idx = 1
	}
	key := [2]int{idx, size}
	if f, ok := c.faces[key]; ok {
		return f, nil
	}
	f, err := opentype.NewFace(c.fonts[idx], &opentype.FaceOptions{Size: float64(size), DPI: 72, Hinting: font.HintingFull})
	if err != nil {
		return nil, fmt.Errorf("font face: %w", err)
	}
	c.faces[key] = f
	return f, nil
}

func (c *canvas) close() {
	for _, f := range c.faces {
		_ = f.Close() // opentype faces hold no resources; Close never fails
	}
}

type align int

const (
	alignLeft align = iota
	alignCenter
	alignRight
)

// text draws s with its baseline at y. x is the left edge, centre or right edge depending on
// a. The size shrinks to minSize to fit maxW, then the text is cut with "...".
func (c *canvas) text(s string, x, y, maxW int, a align, bold bool, size, minSize int, col color.Color) error {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	var face font.Face
	var err error
	for ; ; size -= 2 {
		if face, err = c.face(bold, size); err != nil {
			return err
		}
		if font.MeasureString(face, s).Ceil() <= maxW || size <= minSize {
			break
		}
	}
	s = fitWidth(face, s, maxW)
	w := font.MeasureString(face, s).Ceil()
	switch a {
	case alignCenter:
		x -= w / 2
	case alignRight:
		x -= w
	}
	d := font.Drawer{Dst: c.img, Src: image.NewUniform(col), Face: face, Dot: fixed.P(x, y)}
	d.DrawString(s)
	return nil
}

// fitWidth cuts s (at a rune boundary) and adds "..." until it fits maxW.
func fitWidth(face font.Face, s string, maxW int) string {
	if font.MeasureString(face, s).Ceil() <= maxW {
		return s
	}
	runes := []rune(s)
	for n := len(runes) - 1; n > 0; n-- {
		cut := strings.TrimSpace(string(runes[:n])) + "..."
		if font.MeasureString(face, cut).Ceil() <= maxW {
			return cut
		}
	}
	return "..."
}

func fill(img *image.RGBA, r image.Rectangle, col color.Color) {
	draw.Draw(img, r, image.NewUniform(col), image.Point{}, draw.Src)
}

// renderCard draws the result card as a PNG.
func renderCard(res Result) ([]byte, error) {
	fonts, err := cardFonts()
	if err != nil {
		return nil, err
	}
	c := &canvas{img: image.NewRGBA(image.Rect(0, 0, cardW, cardH)), fonts: fonts, faces: map[[2]int]font.Face{}}
	defer c.close()
	fill(c.img, c.img.Bounds(), cardBg)
	if err := drawHeader(c, res); err != nil {
		return nil, err
	}
	panel := image.Rect(cardPad-16, 168, cardW-cardPad+16, cardH-72)
	fill(c.img, panel.Inset(-2), cardLine)
	fill(c.img, panel, cardPanel)
	if res.Kind == KindMatch {
		err = drawMatch(c, res, panel)
	} else {
		err = drawStandings(c, res, panel)
	}
	if err != nil {
		return nil, err
	}
	if err := drawFooter(c, res); err != nil {
		return nil, err
	}
	draw.Draw(c.img, image.Rect(0, cardH-10, cardW, cardH), cardAccent, image.Point{}, draw.Src)
	var buf bytes.Buffer
	if err := png.Encode(&buf, c.img); err != nil {
		return nil, fmt.Errorf("encode card: %w", err)
	}
	return buf.Bytes(), nil
}

func drawHeader(c *canvas, res Result) error {
	logo, err := cardLogo()
	if err != nil {
		return err
	}
	box := image.Rect(cardPad, 48, cardPad+80, 128)
	draw.CatmullRom.Scale(c.img, box, logo, logo.Bounds(), draw.Over, nil)
	if err := c.text("Snookit", cardPad+100, 102, 300, alignLeft, true, 40, 40, cardText); err != nil {
		return err
	}
	return c.text(res.League, cardW-cardPad, 102, 640, alignRight, false, 32, 24, cardMuted)
}

func drawMatch(c *canvas, res Result, panel image.Rectangle) error {
	mid := (panel.Min.X + panel.Max.X) / 2
	title := res.Label
	if res.Caption != "" {
		title += "  |  " + res.Caption
	}
	if err := c.text(title, mid, panel.Min.Y+86, panel.Dx()-80, alignCenter, false, 32, 24, cardMuted); err != nil {
		return err
	}
	colourOf := func(side string) color.Color {
		if res.Winner == side {
			return cardGold
		}
		return cardText
	}
	nameW := 330
	nameY := panel.Min.Y + 250
	leftX, rightX := panel.Min.X+40+nameW/2, panel.Max.X-40-nameW/2
	if err := c.text(res.SideA, leftX, nameY, nameW, alignCenter, true, 52, 30, colourOf("a")); err != nil {
		return err
	}
	if err := c.text(res.SideB, rightX, nameY, nameW, alignCenter, true, 52, 30, colourOf("b")); err != nil {
		return err
	}
	score := fmt.Sprintf("%d - %d", res.FramesA, res.FramesB)
	return c.text(score, mid, nameY+24, 300, alignCenter, true, 128, 72, cardText)
}

// maxCardRows is how many standings fit on the card.
const maxCardRows = 3

func drawStandings(c *canvas, res Result, panel image.Rectangle) error {
	left, right := panel.Min.X+40, panel.Max.X-40
	if err := c.text(res.Label, left, panel.Min.Y+70, right-left, alignLeft, true, 48, 32, cardText); err != nil {
		return err
	}
	if err := c.text(res.Caption, left, panel.Min.Y+116, right-left, alignLeft, false, 28, 22, cardMuted); err != nil {
		return err
	}
	y := panel.Min.Y + 200
	for i, row := range res.Standings {
		if i == maxCardRows {
			break
		}
		col := cardText
		if row.Winner {
			col = cardGold
		}
		if err := c.text(row.Place, left, y, 70, alignLeft, true, 36, 28, col); err != nil {
			return err
		}
		if err := c.text(row.Detail, right, y, 300, alignRight, false, 32, 24, cardMuted); err != nil {
			return err
		}
		if err := c.text(row.Name, left+80, y, right-left-80-320, alignLeft, true, 36, 26, col); err != nil {
			return err
		}
		y += 60
	}
	return nil
}

func drawFooter(c *canvas, res Result) error {
	line := res.When
	switch {
	case res.Live:
		line = "LIVE now"
	case res.Status != "":
		line = res.Status + "  |  " + res.When
	}
	return c.text(line, cardW/2, cardH-30, cardW-2*cardPad, alignCenter, false, 28, 22, cardMuted)
}

// resultImage serves /m/{id}/card.png (and /r/, /g/): the link preview picture.
func (h *Handler) resultImage(kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		res, err := h.loadResult(r.Context(), kind, chi.URLParam(r, "id"))
		if errors.Is(err, syncmod.ErrNotFound) || errors.Is(err, errBadKind) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			slog.Error("result card", "error", err, "kind", kind)
			http.Error(w, "Try again later.", http.StatusInternalServerError)
			return
		}
		body, err := renderCard(res)
		if err != nil {
			slog.Error("render result card", "error", err, "kind", kind)
			http.Error(w, "Try again later.", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		// The page links the card with ?v=<version>, so a changed result gets a new URL.
		w.Header().Set("Cache-Control", "public, max-age=3600")
		if _, err := w.Write(body); err != nil {
			slog.Error("write result card", "error", err)
		}
	}
}
