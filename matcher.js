(function(){
  const DEFAULTS = {
    maxPrototypes: 32,
    refineTopMembers: 12,
    topK: 5,
    duplicateDistance: 0.018
  };

  function build(rawData, options={}){
    const config = {...DEFAULTS, ...options};
    const rows = Object.entries(rawData || {})
      .filter(([, rows]) => Array.isArray(rows) && rows.length)
      .map(([name, rows]) => {
        const descriptors = compactDescriptors(
          rows
            .map(row => row && row.descriptor ? toFloatDescriptor(row.descriptor) : null)
            .filter(Boolean),
          config.duplicateDistance
        );
        const prototypes = buildPrototypes(descriptors, config.maxPrototypes);
        return {name, descriptors, prototypes};
      })
      .filter(row => row.descriptors.length && row.prototypes.length);
    return {rows, config, ready:rows.length > 0};
  }

  function candidates(index, descriptor, options={}){
    if(!index || !index.rows || !index.rows.length) return [];
    const config = {...index.config, ...options};
    const quick = index.rows
      .map(row => ({
        name:row.name,
        row,
        quickDistance:robustDistance(descriptor, row.prototypes, config.topK)
      }))
      .filter(row => Number.isFinite(row.quickDistance))
      .sort((a,b) => a.quickDistance - b.quickDistance);

    const refineCount = Math.min(config.refineTopMembers, quick.length);
    for(let i = 0; i < refineCount; i++){
      quick[i].distance = robustDistance(descriptor, quick[i].row.descriptors, config.topK);
    }
    for(let i = refineCount; i < quick.length; i++){
      quick[i].distance = quick[i].quickDistance;
    }

    return quick
      .sort((a,b) => a.distance - b.distance)
      .map(({name, distance, quickDistance}) => ({name, distance, quickDistance}));
  }

  function toFloatDescriptor(values){
    if(!Array.isArray(values) || values.length !== 128) return null;
    const descriptor = new Float32Array(128);
    for(let i = 0; i < 128; i++){
      const value = Number(values[i]);
      if(!Number.isFinite(value)) return null;
      descriptor[i] = value;
    }
    return descriptor;
  }

  function compactDescriptors(descriptors, duplicateDistance){
    const next = [];
    descriptors.forEach(descriptor => {
      const duplicate = next.some(saved => euclideanDistance(descriptor, saved) <= duplicateDistance);
      if(!duplicate) next.push(descriptor);
    });
    return next;
  }

  function buildPrototypes(descriptors, maxPrototypes){
    if(descriptors.length <= maxPrototypes) return descriptors.slice();
    const centroid = averageDescriptor(descriptors);
    const first = nearestDescriptor(centroid, descriptors);
    const selected = [first];

    while(selected.length < maxPrototypes){
      let best = null;
      let bestDistance = -1;
      descriptors.forEach(descriptor => {
        if(selected.includes(descriptor)) return;
        const distance = minDistance(descriptor, selected);
        if(distance > bestDistance){
          best = descriptor;
          bestDistance = distance;
        }
      });
      if(!best) break;
      selected.push(best);
    }

    return refinePrototypes(descriptors, selected);
  }

  function refinePrototypes(descriptors, seeds){
    const clusters = seeds.map(() => []);
    descriptors.forEach(descriptor => {
      let bestIndex = 0;
      let bestDistance = Infinity;
      seeds.forEach((seed, index) => {
        const distance = euclideanDistance(descriptor, seed);
        if(distance < bestDistance){
          bestDistance = distance;
          bestIndex = index;
        }
      });
      clusters[bestIndex].push(descriptor);
    });

    return clusters
      .map(cluster => {
        if(!cluster.length) return null;
        return nearestDescriptor(averageDescriptor(cluster), cluster);
      })
      .filter(Boolean);
  }

  function robustDistance(descriptor, descriptors, topK){
    const distances = descriptors
      .map(saved => euclideanDistance(descriptor, saved))
      .filter(Number.isFinite)
      .sort((a,b) => a - b);
    if(!distances.length) return Infinity;
    const topCount = distances.length >= 5
      ? Math.min(topK, Math.max(2, Math.ceil(distances.length * 0.2)))
      : Math.min(2, distances.length);
    const top = distances.slice(0, topCount);
    const avg = top.reduce((sum, value) => sum + value, 0) / top.length;
    const consistencyPenalty = top.length > 1 ? Math.max(0, avg - distances[0]) * 0.35 : 0;
    return distances[0] * 0.35 + avg * 0.65 + consistencyPenalty;
  }

  function averageDescriptor(descriptors){
    const avg = new Float32Array(128);
    descriptors.forEach(descriptor => {
      for(let i = 0; i < 128; i++) avg[i] += descriptor[i];
    });
    for(let i = 0; i < 128; i++) avg[i] /= descriptors.length;
    return avg;
  }

  function nearestDescriptor(target, descriptors){
    let best = descriptors[0];
    let bestDistance = Infinity;
    descriptors.forEach(descriptor => {
      const distance = euclideanDistance(target, descriptor);
      if(distance < bestDistance){
        best = descriptor;
        bestDistance = distance;
      }
    });
    return best;
  }

  function minDistance(target, descriptors){
    let best = Infinity;
    descriptors.forEach(descriptor => {
      best = Math.min(best, euclideanDistance(target, descriptor));
    });
    return best;
  }

  function euclideanDistance(a, b){
    if(!a || !b || a.length !== b.length) return Infinity;
    let sum = 0;
    for(let i = 0; i < a.length; i++){
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  window.AstraFaceIndex = {
    build,
    candidates,
    robustDistance,
    euclideanDistance
  };
})();
