# Demo Guide - Backend Skeleton

## How to Run

### 1. Start the Server
```bash
./run.sh
```

Wait for: `[INFO] Server started on http://0.0.0.0:8080`

**Note:** If you just updated the code, restart the server:
- Press `Ctrl+C` to stop
- Run `./run.sh` again

### 2. Test It (in new terminal)
```bash
# Health check
curl http://localhost:8080/health

# Trigger notebook
curl -X POST http://localhost:8080/trigger -H "X-API-Key: demo-key"
```

---

## Common Errors & Fixes

### Netty ReadTimeoutException Warnings (Harmless)
**Cause:** Netty HTTP client warnings during polling

**What you see:**
```
WARNING: io.netty.handler.timeout.ReadTimeoutException
```

**Fix:** These are **harmless warnings** - not errors! They occur during the 2-second polling intervals while waiting for your notebook to complete. Your API still works correctly. You can ignore them or suppress by adding to your terminal:
```bash
# Suppress Netty warnings (optional)
export JAVA_OPTS="-Djava.util.logging.config.file=logging.properties"
```

---

### "Address already in use"
**Cause:** Port 8080 is already taken

**Fix:**
```bash
lsof -ti:8080 | xargs kill -9
sbt run
```

---

### "Authentication required"
**Cause:** Missing API key header

**Fix:** Add the header:
```bash
curl -X POST http://localhost:8080/trigger -H "X-API-Key: demo-key"
```

---

### "Databricks API error (HTTP 401)"
**Cause:** Token expired or invalid

**Fix:**
1. Go to Databricks workspace
2. Click profile → User Settings → Developer → Access Tokens
3. Generate New Token
4. Update `DATABRICKS_TOKEN` in `.env` file
5. Restart: Kill server (Ctrl+C), reload `.env`, and run `sbt run` again

---

### "Databricks API error (HTTP 404)"
**Cause:** Notebook path doesn't exist

**Fix:**
1. Open your notebook in Databricks
2. Look at breadcrumb: `Workspace > Users > your.email > NotebookName`
3. Update `NOTEBOOK_PATH` in `.env` file
4. Restart: Kill server (Ctrl+C), reload `.env`, and run `sbt run` again

---

### "Invalid notebook path format"
**Cause:** Path validation failed

**Fix:** In `.env` file, make sure path starts with `/` and uses quotes if it has spaces:
```bash
NOTEBOOK_PATH="/Users/lthomas13@sheffield.ac.uk/Demo 1"
```

---

## What Your Demo Shows

✅ Scala backend connects to Databricks REST API  
✅ Triggers **"Demo" notebook** execution on Databricks cluster  
✅ Polls for completion  
✅ Returns execution trace as JSON

**Your Demo Notebook Executes:**
- **Cell 1:** Setup widgets (catalog, schema, table, partitions, thresholds)
- **Cell 2:** Load advertising data, create TV buckets, flag high radio spend
- **Cell 3:** Repartition by TV_bucket (demonstrates shuffle), measure timing & partition distribution
- **Cell 4:** Join with labels (broadcast vs shuffle mode), show query plans
- **Cell 5:** Linear Regression ML pipeline, evaluate RMSE & R²

**Captured Metrics:**
- Row counts, execution times
- Partition distribution (empty vs non-empty)
- Join strategies (BroadcastHashJoin vs ShuffleExchange)
- ML model coefficients & performance

---

## Demo Flow

**Terminal 1:** Start server
```bash
./run.sh
```

**Terminal 2:** Test endpoints
```bash
curl http://localhost:8080/health
curl -X POST http://localhost:8080/trigger -H "X-API-Key: demo-key"
```

**Show:** JSON response with runId, state, and output

**Note:** The notebook will take 30-60 seconds to execute (ML training + multiple Spark jobs)

---

## Success Response

**Your API will return:**
```json
{
  "runId": 123456789,
  "state": "SUCCESS",
  "output": {
    "result": "{\"status\": \"success\", \"notebook\": \"Demo - Spark Fundamentals\", \"timestamp\": \"2025-11-06T17:22:16.185163\", \"message\": \"Completed: data loading, repartitioning, joins, and ML training\"}"
  }
}
```

**The notebook output (in `result` field) is:**
```json
{
  "status": "success",
  "notebook": "Demo - Spark Fundamentals",
  "timestamp": "2025-11-06T17:22:16.185163",
  "message": "Completed: data loading, repartitioning, joins, and ML training"
}
```

✅ This structured JSON is ready for frontend parsing and visualization!

---

## Cell 6 for Your Notebook (Optional - Returns Structured JSON)

Add this as Cell 6 in your Databricks notebook to return structured JSON:

```python
# Cell 6: Return structured trace for visualization
import json
from datetime import datetime

output = {
    "status": "success",
    "notebook": "Demo - Spark Fundamentals",
    "timestamp": datetime.now().isoformat(),
    "message": "Completed: data loading, repartitioning, joins, and ML training"
}

print(json.dumps(output, indent=2))
dbutils.notebook.exit(json.dumps(output))
```

This returns clean JSON instead of text output.

---

Done! 🎉

