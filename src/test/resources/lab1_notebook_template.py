# test fixture shadowing the production lab1 notebook
DATASET_PATH = "/Volumes/main/default/sparkml_tmp"
SKIP_REPARTITION = False
INJECTED_FILTER_PREDICATE = '.jp'

# SPARK-VIZ-STEP-2-BEGIN
original_step_2 = True
# SPARK-VIZ-STEP-2-END

# SPARK-VIZ-STEP-3-BEGIN
hosts_japan = logs.filter(logs.value.contains('.jp'))
# SPARK-VIZ-STEP-3-END

