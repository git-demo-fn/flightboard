package workorder

import (
	"errors"
	"testing"
	"time"
)

func validPublished() WorkOrder {
	start := time.Date(2026, 10, 23, 9, 0, 0, 0, time.UTC)
	return WorkOrder{
		Title:      "Install access points",
		TypeOfWork: "Networking",
		Status:     StatusPublished,
		Buyer:      "Northwind Retail",
		Location:   Location{City: "Minneapolis", State: "MN"},
		Schedule:   &Schedule{Start: start, End: start.Add(4 * time.Hour)},
		Pay:        Pay{Type: PayHourly, Rate: 65, Hours: 4},
	}
}

func TestValidateNew(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*WorkOrder)
		wantErr bool
	}{
		{"valid published", func(*WorkOrder) {}, false},
		{"draft needs only a title", func(w *WorkOrder) { *w = WorkOrder{Title: "x", Status: StatusDraft} }, false},
		{"missing title", func(w *WorkOrder) { w.Title = "  " }, true},
		{"assigned is not a valid new status", func(w *WorkOrder) { w.Status = StatusAssigned }, true},
		{"published without location", func(w *WorkOrder) { w.Location = Location{} }, true},
		{"published without schedule", func(w *WorkOrder) { w.Schedule = nil }, true},
		{"end before start", func(w *WorkOrder) { w.Schedule.End = w.Schedule.Start.Add(-time.Hour) }, true},
		{"hourly without hours", func(w *WorkOrder) { w.Pay.Hours = 0 }, true},
		{"zero rate", func(w *WorkOrder) { w.Pay.Rate = 0 }, true},
		{"per device without devices", func(w *WorkOrder) { w.Pay = Pay{Type: PayPerDevice, Rate: 40} }, true},
		{"unknown pay type", func(w *WorkOrder) { w.Pay.Type = "Barter" }, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := validPublished()
			tt.mutate(&w)
			err := ValidateNew(w)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateNew() err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil && !errors.Is(err, ErrInvalid) {
				t.Fatalf("error %v does not wrap ErrInvalid", err)
			}
		})
	}
}

func TestCanTransition(t *testing.T) {
	tests := []struct {
		from, to Status
		want     bool
	}{
		{StatusDraft, StatusPublished, true},
		{StatusDraft, StatusRouted, true},
		{StatusPublished, StatusAssigned, true},
		{StatusAssigned, StatusWorkDone, true},
		{StatusWorkDone, StatusApproved, true},
		{StatusApproved, StatusPaid, true},
		{StatusDraft, StatusPaid, false},
		{StatusPaid, StatusDraft, false},
		{StatusCancelled, StatusPublished, false},
	}
	for _, tt := range tests {
		if got := CanTransition(tt.from, tt.to); got != tt.want {
			t.Errorf("CanTransition(%s, %s) = %v, want %v", tt.from, tt.to, got, tt.want)
		}
	}
}

func TestParseStatus(t *testing.T) {
	got, err := ParseStatus("work done")
	if err != nil || got != StatusWorkDone {
		t.Fatalf("ParseStatus(work done) = %q, %v", got, err)
	}
	if _, err := ParseStatus("Lost"); err == nil {
		t.Fatal("ParseStatus(Lost) want error")
	}
}
