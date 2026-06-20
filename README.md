# 📚 Bookstore App — 3-Tier Deployment on GKE

This is a project I built to move beyond running everything locally on my machine. I wanted to understand what a real cloud deployment actually looks like — not just "docker run" on a laptop, but a proper three-tier architecture running on Kubernetes with persistent storage, internal networking, and a single public entry point.

Here's what I built, why I made the decisions I made, and exactly how I deployed it.

---

## What Problem I Was Solving

When I started this, my entire app was a monolith — frontend, backend, and database all tangled together. Updating one thing risked breaking everything else. Scaling was impossible without scaling the whole thing.

So I split it into three independent layers that each do one job:

```
Browser (User)
      ↓
Nginx Frontend        ← I serve static HTML/CSS/JS from here
      ↓
Flask Backend API     ← all my business logic lives here, JSON only
      ↓
MongoDB               ← my data lives here, on a persistent disk
```

Now I can update the frontend without touching the backend. I can scale the backend without touching the database. Each layer is independent.

---

## How Traffic Flows Through the App

```
Internet
    │
    ▼
[ Ingress / GCE Load Balancer ]   ← one public IP, this is my front door
    │
    ├──  /        →  Frontend (Nginx)
    └──  /api     →  Backend (Flask)
                          │
                          ▼
                    MongoDB Service
                    (ClusterIP — internal only, internet can't touch this)
                          │
                          ▼
                  Google Cloud Persistent Disk
                  (my data lives here, survives Pod restarts)
```

---

## Kubernetes Components I Used and Why

| Component | Type | Why I chose it |
|---|---|---|
| **Ingress** | GCE Load Balancer | I needed one single public IP for the whole app. Ingress routes `/` to frontend and `/api` to backend — no need for two separate Load Balancers. |
| **Frontend Service** | NodePort | The Ingress controller needs a stable port on the node to find my frontend Pods. NodePort gives it exactly that. |
| **Backend Service** | NodePort | Same reason. Ingress routes `/api` traffic to my Flask backend via NodePort. |
| **MongoDB Service** | ClusterIP | I never want my database exposed to the internet. ClusterIP keeps it completely internal — only my backend can reach it, nothing else. |
| **PVC** | PersistentVolumeClaim | Pods are temporary. Without this, every time my MongoDB Pod restarted, I'd lose all my data. PVC links MongoDB to a real Google Cloud disk so data always survives. |
| **ConfigMap** | ConfigMap | I inject the backend API URL into my frontend at runtime. This way I don't have to rebuild my Docker image just to change a URL. |

---

## How I Deployed It — Step by Step

### Step 1 — Create the GKE Cluster

```bash
gcloud container clusters create bookstore-cluster \
  --zone=us-central1-a \
  --num-nodes=2 \
  --machine-type=e2-medium
```

I used a zonal cluster with just 2 nodes to keep costs down. Going multi-zone would have multiplied my nodes across zones — 2 nodes silently becomes 6. For this project, one zone is perfectly fine.

---

### Step 2 — Deploy MongoDB First

```bash
kubectl apply -f mongodb-k8s.yaml
```

I deploy the database first because my backend needs it to already exist when it starts up. This single file handles three things at once — it creates the PVC (reserves my persistent disk), the MongoDB Deployment (the actual Pod), and the ClusterIP Service (the internal DNS name `mongodb-service` that my backend uses to find the database).

---

### Step 3 — Verify the Disk is Actually Attached

```bash
kubectl get pvc
```

I always check this before moving on. I'm looking for `Status: Bound` — that means the Google Cloud disk is provisioned and attached to the MongoDB Pod. If it shows `Pending`, I wait 15-20 seconds and check again. GCP needs a moment to provision the disk in the background.

**What I want to see:**
```
NAME           STATUS   VOLUME       CAPACITY   ACCESS MODES
mongo-pvc      Bound    pvc-abc123   10Gi       RWO
```

---

### Step 4 — Deploy the Flask Backend

```bash
kubectl apply -f backend-k8s.yaml
```

This deploys my Python Flask API. It only speaks JSON — no HTML, no templates, purely business logic. It connects to MongoDB using the internal service name `mongodb-service` that I set up in Step 2. No hardcoded IPs anywhere in my code.

---

### Step 5 — Configure and Deploy the Frontend and Wire Up the Ingress

Before we deploy the UI, we need to inject our environment variables. We use a ConfigMap so the frontend knows to send API calls to the /api path on our Ingress IP.

1. Create the configuration:

```bash
kubectl create configmap frontend-config --from-literal=config.js="const API_BASE_URL = '/api';"
```

2. Deploy the Frontend and Ingress:

```bash
kubectl apply -f frontend-k8s.yaml
kubectl apply -f bookstore-ingress.yaml
```

The first command creates a virtual file called config.js inside the cluster. When the Nginx Pod starts, it "grabs" this file and mounts it directly into the /js folder. This is the "DevOps Pro" way to handle settings—it means my Docker image remains generic and I can change the API path at any time without rebuilding the whole image.

The second command creates the Ingress — my single public Load Balancer. It's the only thing in my entire cluster that's exposed to the internet. Everything else is internal.

> ⏳ **Important:** GKE Ingress takes 5-10 minutes to become fully active after I apply it. The external IP appears quickly but the backend health checks take time to go green. I just wait and don't panic.

---

### Step 6 — Verify Everything is Running

```bash
# Check all three tiers are up
kubectl get pods

# Check Ingress has a public IP and healthy backends
kubectl describe ingress bookstore-ingress
```

**What I'm looking for in `kubectl get pods`:**
```
NAME                          READY   STATUS    RESTARTS
mongo-deployment-xxx          1/1     Running   0
backend-deployment-xxx        1/1     Running   0
frontend-deployment-xxx       1/1     Running   0
```

All three layers running. If anything shows `ContainerCreating`, I wait. If anything shows `CrashLoopBackOff`, I run:

```bash
# See what the app printed before it crashed
kubectl logs <pod-name> --previous

# See what Kubernetes observed (image errors, resource issues etc.)
kubectl describe pod <pod-name>
```

In `kubectl describe ingress` I look for the `Address` field — that's my public IP. Once the backends show `HEALTHY`, the app is live.

---

### Step 7 — Restore My MongoDB Data

The MongoDB Pod starts completely empty. My book data is in a backup archive that I restore in two steps.

**Copy the archive into the running Pod:**
```bash
kubectl cp db_backup.archive <mongo-pod-name>:/tmp/db_backup.archive
```

**Restore the database from the archive:**
```bash
kubectl exec -it <mongo-pod-name> -- mongorestore --archive=/tmp/db_backup.archive --nsInclude="bookstore.*"
```

> ⚠️ I replace `<mongo-pod-name>` with the actual Pod name from `kubectl get pods`. It looks something like `mongo-deployment-6bc85c5bf9-qggs7`.

`kubectl cp` works exactly like a regular file copy, except the destination is inside a running container. Then `mongorestore` loads the archive back into MongoDB. The `--nsInclude="bookstore.*"` flag makes sure I only restore my bookstore database and nothing else.

---

## Debugging Commands I Actually Use

```bash
# See all pods and current status
kubectl get pods

# Full event log for a specific pod — this is where errors actually show up
kubectl describe pod <pod-name>

# Live logs from a running pod
kubectl logs <pod-name>

# Logs from the last crashed instance of a pod
kubectl logs <pod-name> --previous

# Check if persistent storage is attached
kubectl get pvc

# Check all services and their internal IPs
kubectl get services

# Check ingress and my public IP
kubectl get ingress
```

---

## Issues I Hit and How I Fixed Them

| Problem | What I did |
|---|---|
| Pod stuck in `ContainerCreating` | Ran `kubectl describe pod <n>` and checked the Events section at the bottom |
| Pod in `CrashLoopBackOff` | Ran `kubectl logs <n> --previous` — the crash reason is always in there |
| PVC stuck in `Pending` | Waited 20-30 seconds — GCP disk provisioning just takes a moment |
| Ingress had no IP | Waited 5-10 minutes — this is normal, GKE takes time to spin up the Load Balancer |
| Frontend couldn't reach backend | My ConfigMap had the wrong API URL — fixed the value and reapplied |
| `mongorestore` failed | I had forgotten to run `kubectl cp` first — the file wasn't inside the Pod yet |

---

## Project File Structure

```
.
├── README.md                  ← this file
├── mongodb-k8s.yaml           ← PVC + MongoDB Deployment + ClusterIP Service
├── backend-k8s.yaml           ← Flask API Deployment + NodePort Service
├── frontend-k8s.yaml          ← Nginx Deployment + ConfigMap + NodePort Service
├── bookstore-ingress.yaml     ← Ingress routing rules + GCE Load Balancer
└── db_backup.archive          ← MongoDB data backup (gzip compressed)
```

---

## How I Update the App Without Downtime

I don't redo the whole deployment. I just push a new Docker image and run:

```bash
kubectl set image deployment/backend-deployment backend=my-image:new-tag
kubectl set image deployment/frontend-deployment frontend=my-image:new-tag
```

Kubernetes handles the rest — it replaces Pods one by one using a rolling update so there's zero downtime. Old Pods stay up until new ones are healthy.
