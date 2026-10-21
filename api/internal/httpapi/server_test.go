package httpapi

import (
	"encoding/json"
	"maps"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"

	"github.com/git-demo-fn/flightboard/api/internal/store"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	st, err := store.NewSeeded()
	if err != nil {
		t.Fatalf("NewSeeded: %v", err)
	}
	return New(st)
}

func do(t *testing.T, s *Server, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return v
}

type woJSON struct {
	ID       int    `json:"id"`
	Status   string `json:"status"`
	Provider *struct {
		Name  string `json:"name"`
		Score int    `json:"score"`
	} `json:"provider"`
	Tasks []struct {
		ID   string `json:"id"`
		Done bool   `json:"done"`
	} `json:"tasks"`
}

func TestHealth(t *testing.T) {
	rec := do(t, newTestServer(t), "GET", "/api/health", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d", rec.Code)
	}
}

func TestListWorkOrders(t *testing.T) {
	s := newTestServer(t)
	for _, tt := range []struct {
		name   string
		query  string
		status string
		count  int
	}{
		{name: "unfiltered", count: 25},
		{name: "empty status", query: "?status=", count: 25},
		{name: "Draft", status: "Draft", count: 3},
		{name: "Published", status: "Published", count: 3},
		{name: "Routed", status: "Routed", count: 3},
		{name: "Assigned", status: "Assigned", count: 8},
		{name: "Work Done", status: "Work Done", count: 3},
		{name: "Approved", status: "Approved", count: 2},
		{name: "Paid", status: "Paid", count: 2},
		{name: "Cancelled", status: "Cancelled", count: 1},
	} {
		t.Run(tt.name, func(t *testing.T) {
			query := tt.query
			if tt.status != "" {
				query = "?status=" + url.QueryEscape(tt.status)
			}
			rec := do(t, s, "GET", "/api/work-orders"+query, "")
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			list := decode[[]woJSON](t, rec)
			if len(list) != tt.count {
				t.Fatalf("count = %d, want %d", len(list), tt.count)
			}
			for i, w := range list {
				if tt.status != "" && w.Status != tt.status {
					t.Errorf("work order %d status = %q, want %q", w.ID, w.Status, tt.status)
				}
				if tt.status == "" && w.ID != 9631825-i {
					t.Errorf("work order at index %d has id %d, want %d", i, w.ID, 9631825-i)
				}
				if i > 0 && list[i-1].ID <= w.ID {
					t.Errorf("work orders not newest first: %d before %d", list[i-1].ID, w.ID)
				}
			}
		})
	}
}

func TestListWorkOrdersExpandsProvider(t *testing.T) {
	rec := do(t, newTestServer(t), "GET", "/api/work-orders?status=Assigned", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	list := decode[[]woJSON](t, rec)
	if len(list) == 0 {
		t.Fatal("no assigned work orders")
	}
	for _, w := range list {
		if w.Status != "Assigned" {
			t.Errorf("work order %d status %q", w.ID, w.Status)
		}
		if w.Provider == nil || w.Provider.Name == "" {
			t.Errorf("work order %d has no expanded provider", w.ID)
		}
	}
}

func TestListWorkOrdersBadStatus(t *testing.T) {
	rec := do(t, newTestServer(t), "GET", "/api/work-orders?status=Lost", "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code = %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q", got)
	}
	got := decode[map[string]string](t, rec)
	if got["error"] != `unknown status "Lost"` {
		t.Errorf("error = %q, want %q", got["error"], `unknown status "Lost"`)
	}
}

func TestGetWorkOrder(t *testing.T) {
	s := newTestServer(t)
	if rec := do(t, s, "GET", "/api/work-orders/9631810", ""); rec.Code != http.StatusOK {
		t.Fatalf("code = %d", rec.Code)
	}
	if rec := do(t, s, "GET", "/api/work-orders/1", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("missing id code = %d", rec.Code)
	}
	if rec := do(t, s, "GET", "/api/work-orders/abc", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad id code = %d", rec.Code)
	}
}

func TestWorkOrderSummary(t *testing.T) {
	for _, tt := range []struct {
		name     string
		server   *Server
		total    int
		byStatus map[string]int
	}{
		{
			name: "seeded", server: newTestServer(t), total: 25,
			byStatus: map[string]int{
				"Draft": 3, "Published": 3, "Routed": 3, "Assigned": 8,
				"Work Done": 3, "Approved": 2, "Paid": 2, "Cancelled": 1,
			},
		},
		{
			name: "empty", server: New(store.New()), total: 0,
			byStatus: map[string]int{
				"Draft": 0, "Published": 0, "Routed": 0, "Assigned": 0,
				"Work Done": 0, "Approved": 0, "Paid": 0, "Cancelled": 0,
			},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, tt.server, "GET", "/api/work-orders/summary", "")
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			if got := rec.Header().Get("Content-Type"); got != "application/json" {
				t.Errorf("Content-Type = %q", got)
			}
			got := decode[struct {
				Total    int            `json:"total"`
				ByStatus map[string]int `json:"byStatus"`
			}](t, rec)
			if got.Total != tt.total {
				t.Errorf("total = %d, want %d", got.Total, tt.total)
			}
			if !maps.Equal(got.ByStatus, tt.byStatus) {
				t.Errorf("byStatus = %v, want %v", got.ByStatus, tt.byStatus)
			}
		})
	}
}

func TestGetEverySeededWorkOrder(t *testing.T) {
	s := newTestServer(t)
	for _, wo := range s.store.ListWorkOrders(store.Filter{}) {
		t.Run(strconv.Itoa(wo.ID), func(t *testing.T) {
			rec := do(t, s, "GET", "/api/work-orders/"+strconv.Itoa(wo.ID), "")
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d body %s", rec.Code, rec.Body)
			}
			if got := decode[woJSON](t, rec); got.ID != wo.ID || got.Status != string(wo.Status) {
				t.Errorf("got work order %+v, want id %d status %q", got, wo.ID, wo.Status)
			}
		})
	}
}

func TestCreateWorkOrder(t *testing.T) {
	s := newTestServer(t)
	body := `{"title":"Install AP","typeOfWork":"Networking","status":"Published","buyer":"Northwind Retail",
		"location":{"city":"Fargo","state":"ND"},
		"schedule":{"start":"2026-10-23T09:00:00Z","end":"2026-10-23T13:00:00Z"},
		"pay":{"type":"Hourly","rate":65,"hours":4}}`
	rec := do(t, s, "POST", "/api/work-orders", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	created := decode[woJSON](t, rec)
	if created.Status != "Published" || len(created.Tasks) == 0 {
		t.Fatalf("unexpected created work order %+v", created)
	}

	rec = do(t, s, "POST", "/api/work-orders", `{"title":"No pay","status":"Published"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid publish code = %d", rec.Code)
	}
	rec = do(t, s, "POST", "/api/work-orders", `{not json`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("bad json code = %d", rec.Code)
	}
}

func TestSetStatus(t *testing.T) {
	s := newTestServer(t)
	rec := do(t, s, "POST", "/api/work-orders/9631819/status", `{"status":"Approved"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	if got := decode[woJSON](t, rec).Status; got != "Approved" {
		t.Fatalf("status = %q", got)
	}
	rec = do(t, s, "POST", "/api/work-orders/9631801/status", `{"status":"Paid"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("illegal transition code = %d", rec.Code)
	}
}

func TestCheckInOut(t *testing.T) {
	s := newTestServer(t)
	rec := do(t, s, "POST", "/api/work-orders/9631812/check-in", `{"time":"2026-10-20T09:02:00Z"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("check-in code = %d body %s", rec.Code, rec.Body)
	}
	rec = do(t, s, "POST", "/api/work-orders/9631812/check-out", `{}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("check-out code = %d body %s", rec.Code, rec.Body)
	}
	rec = do(t, s, "POST", "/api/work-orders/9631801/check-in", `{}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("draft check-in code = %d", rec.Code)
	}
}

func TestUpdateTask(t *testing.T) {
	s := newTestServer(t)
	rec := do(t, s, "PATCH", "/api/work-orders/9631801/tasks/t1", `{"done":true}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d body %s", rec.Code, rec.Body)
	}
	if !decode[woJSON](t, rec).Tasks[0].Done {
		t.Fatal("task not marked done")
	}
	if rec := do(t, s, "PATCH", "/api/work-orders/9631801/tasks/zz", `{"done":true}`); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown task code = %d", rec.Code)
	}
}

func TestProviders(t *testing.T) {
	s := newTestServer(t)
	rec := do(t, s, "GET", "/api/providers", "")
	list := decode[[]struct {
		ID    string `json:"id"`
		Score int    `json:"score"`
	}](t, rec)
	if len(list) == 0 {
		t.Fatal("no providers")
	}
	for i := 1; i < len(list); i++ {
		if list[i-1].Score < list[i].Score {
			t.Fatal("providers not sorted by score")
		}
	}
	if rec := do(t, s, "GET", "/api/providers/"+list[0].ID, ""); rec.Code != http.StatusOK {
		t.Fatalf("get provider code = %d", rec.Code)
	}
	if rec := do(t, s, "GET", "/api/providers/nope", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("missing provider code = %d", rec.Code)
	}
}
