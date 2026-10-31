package public

// Bracket is a tournament as the public page shows it.
type Bracket struct {
	Name     string
	League   string
	Status   string
	Champion string
	Rounds   []BracketRound
}

// BracketRound is one round of fixtures.
type BracketRound struct {
	Name    string
	Matches []BracketMatch
}

// BracketMatch is one fixture with short names and its score ("-" until played).
type BracketMatch struct {
	SideA, SideB, Score, Winner string
}
