# Three-Tier-GKE-App

A three-tier bookstore application (Flask backend, Nginx-served frontend, MongoDB) deployed to a production-style setup on Google Kubernetes Engine, with a GCE-managed load balancer routing traffic through an Ingress.

This is the GKE-native version of the bookstore project — separate from the Docker Compose / Jenkins version, this one focuses on how the same application looks once it's running on a real Kubernetes cluster instead of a single host.

## What this project covers

- Deploying each tier (frontend, backend, database) as its own Kubernetes Deployment and Service, so they scale and fail independently.
- Running MongoDB with a PersistentVolumeClaim, so data survives pod restarts instead of disappearing every time the database pod is rescheduled.
- Routing all external traffic through a single GKE Ingress, splitting requests by path — `/api` goes to the backend, everything else goes to the frontend — instead of exposing each service with its own public IP.
- Using NodePort services behind the Ingress (instead of LoadBalancer per service), since the Ingress already provisions a single Google Cloud Load Balancer for the whole app.
- Mounting frontend configuration as a ConfigMap volume, so environment-specific settings can change without rebuilding the container image.
- Running 2 replicas each for frontend and backend, with each tier scaled independently of the other.
- Deploying Prometheus and Grafana on the cluster using the `kube-prometheus-stack` Helm chart, with custom Grafana dashboards exposed through the same GKE Ingress as the app.

## Architecture

```
                              Internet
                                 │
                                 ▼
                       ┌───────────────────┐
                       │   GKE Ingress      │
                       │ (Google Cloud LB)  │
                       └─────────┬─────────┘
        /                        │   /api          /grafana
        ▼                             ▼                 ▼
┌────────────────┐          ┌───────────────┐    ┌───────────────┐
│frontend-service│          │backend-service│    │   Grafana     │
│   (NodePort)   │          │   (NodePort)  │    │   (Service)   │
└───────┬────────┘          └───────┬───────┘    └───────┬───────┘
        │                           │                     │
┌───────▼───────────┐     ┌─────────▼─────────┐  ┌────────▼─────────┐
│frontend-deployment│     │backend-deployment │  │ kube-prometheus- │
│ (Nginx, 2 pods)   │     │  (Flask, 2 pods)  │  │ stack (Helm)     │
└───────────────────┘     └─────────┬─────────┘  └──────────────────┘
                                    │
                          ┌─────────▼───────────┐
                          │ mongodb-deployment  │
                          │  + PersistentVolume │
                          └─────────────────────┘
```

## Folder structure

```
backend/                Flask API, MongoDB connection, Dockerfile
frontend/                Static site + Nginx, Dockerfile
backend-stack.yaml       Backend Deployment + Service
frontend-k8s.yaml        Frontend Deployment + Service
mongo-stack.yaml         MongoDB Deployment + PVC + Service
ingress.yaml             GKE Ingress routing rules
```

## Tech used

Kubernetes (GKE), Docker, Nginx, Flask, MongoDB, Prometheus, Grafana, Helm, GCE Load Balancer

## API endpoints

- `GET /api/books` — list all books
- `GET /api/books/<id>` — get a single book
- `GET /api/books/category/<name>` — filter books by category

## Deploying

```bash
# 1. Apply the manifests
kubectl apply -f mongo-stack.yaml
kubectl apply -f backend-stack.yaml
kubectl apply -f frontend-k8s.yaml
kubectl apply -f ingress.yaml

# 2. Install Prometheus + Grafana via Helm
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack

# 3. Get the Ingress external IP (can take a few minutes to provision)
kubectl get ingress bookstore-ingress
```

## What I'd improve next

- Add resource requests/limits to the frontend and backend Deployments (already set on MongoDB, missing on the rest).
- Add a Horizontal Pod Autoscaler so the backend scales based on load instead of a fixed replica count.
- Add liveness/readiness probes so GKE can detect and restart unhealthy pods automatically.
