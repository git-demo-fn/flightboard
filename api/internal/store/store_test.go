package store

import (
	"errors"
	"testing"
	"time"

	"github.com/git-demo-fn/flightboard/api/internal/workorder"
)

func seeded(t *testing.T) *Store {
	t.Helper()
	s, err := NewSeeded()
	if err != nil {
		t.Fatalf("NewSeeded: %v", err)
	}
	return s
}

func TestSeedIsConsistent(t *testing.T) {
	s := seeded(t)
	all := s.ListWorkOrders(Filter{})
	if len(all) < 20 {
		t.Fatalf("seed has %d work orders, want at least 20", len(all))
	}
	if len(s.ListProviders()) < 5 {
		t.Fatal("seed has too few providers")
	}
	for _, w := range all {
		if w.ProviderID != "" {
			if _, err := s.GetProvider(w.ProviderID); err != nil {
				t.Errorf("work order %d references unknown provider %q", w.ID, w.ProviderID)
			}
		}
		if len(w.Tasks) == 0 {
			t.Errorf("work order %d has no tasks", w.ID)
		}
		if err := workorder.ValidatePay(w.Pay); err != nil && w.Pay.Type != workorder.PayBlended {
			t.Errorf("work order %d has invalid pay: %v", w.ID, err)
		}
	}
}

func TestListWorkOrdersFilters(t *testing.T) {
	s := seeded(t)
	for _, w := range s.ListWorkOrders(Filter{Status: workorder.StatusAssigned}) {
		if w.Status != workorder.StatusAssigned {
			t.Fatalf("status filter returned %s", w.Status)
		}
	}
	for _, w := range s.ListWorkOrders(Filter{ProviderID: "p-101"}) {
		if w.ProviderID != "p-101" {
			t.Fatalf("provider filter returned %q", w.ProviderID)
		}
	}
	list := s.ListWorkOrders(Filter{})
	for i := 1; i < len(list); i++ {
		if list[i-1].ID < list[i].ID {
			t.Fatal("list is not sorted newest id first")
		}
	}
}

func TestCreateWorkOrderAssignsIDAndDefaults(t *testing.T) {
	s := seeded(t)
	created, err := s.CreateWorkOrder(workorder.WorkOrder{Title: "New draft", Status: workorder.StatusDraft, ProviderID: "p-101"})
	if err != nil {
		t.Fatalf("CreateWorkOrder: %v", err)
	}
	if created.ID == 0 || created.ProviderID != "" {
		t.Fatalf("got id %d provider %q, want new id and no provider", created.ID, created.ProviderID)
	}
	if len(created.Tasks) != len(workorder.DefaultTasks()) {
		t.Fatalf("got %d tasks, want default tasks", len(created.Tasks))
	}
	if created.Health != workorder.HealthOnTrack {
		t.Fatalf("health = %q", created.Health)
	}
	if _, err := s.GetWorkOrder(created.ID); err != nil {
		t.Fatalf("GetWorkOrder after create: %v", err)
	}
}

func TestCreateWorkOrderRejectsInvalid(t *testing.T) {
	_, err := New().CreateWorkOrder(workorder.WorkOrder{Status: workorder.StatusDraft})
	if !errors.Is(err, workorder.ErrInvalid) {
		t.Fatalf("err = %v, want ErrInvalid", err)
	}
}

func TestSetStatus(t *testing.T) {
	s := seeded(t)
	if _, err := s.SetStatus(9631818, workorder.StatusApproved); err != nil {
		t.Fatalf("Work Done -> Approved: %v", err)
	}
	if _, err := s.SetStatus(9631801, workorder.StatusPaid); !errors.Is(err, ErrConflict) {
		t.Fatalf("Draft -> Paid err = %v, want ErrConflict", err)
	}
	if _, err := s.SetStatus(1, workorder.StatusPaid); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown id err = %v, want ErrNotFound", err)
	}
}

func TestSetTaskDone(t *testing.T) {
	s := seeded(t)
	w, err := s.SetTaskDone(9631801, "t1", true)
	if err != nil {
		t.Fatalf("SetTaskDone: %v", err)
	}
	if !w.Tasks[0].Done {
		t.Fatal("task t1 not marked done")
	}
	if _, err := s.SetTaskDone(9631801, "nope", true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown task err = %v", err)
	}
}

func TestCheckInAndOut(t *testing.T) {
	s := seeded(t)
	at := time.Date(2026, 10, 22, 9, 5, 0, 0, time.UTC)
	w, err := s.CheckIn(9631817, at)
	if err != nil {
		t.Fatalf("CheckIn: %v", err)
	}
	if w.CheckIn == nil || !w.CheckIn.Equal(at) || w.SubStatus != workorder.SubCheckedIn {
		t.Fatalf("check in not recorded: %+v", w)
	}
	w, err = s.CheckOut(9631817, at.Add(3*time.Hour))
	if err != nil {
		t.Fatalf("CheckOut: %v", err)
	}
	if w.SubStatus != workorder.SubCheckedOut {
		t.Fatalf("sub-status = %q", w.SubStatus)
	}
	if _, err := s.CheckIn(9631801, at); !errors.Is(err, ErrConflict) {
		t.Fatalf("check in on draft err = %v, want ErrConflict", err)
	}
}

func TestReturnedValuesAreCopies(t *testing.T) {
	s := seeded(t)
	w, _ := s.GetWorkOrder(9631810)
	w.Tasks[0].Title = "changed"
	again, _ := s.GetWorkOrder(9631810)
	if again.Tasks[0].Title == "changed" {
		t.Fatal("caller mutation leaked into the store")
	}
}
