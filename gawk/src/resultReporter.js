import path from 'path';

class ResultReporter {
  static groupResultsByDirectory(results) {
    return results.reduce((acc, result) => {
      if (!result.success) return acc;
      
      const dir = path.dirname(result.originalPath);
      if (!acc[dir]) {
        acc[dir] = {
          contentChanged: 0,
          nameChanged: 0,
          unchanged: 0
        };
      }
      
      if (result.status.contentChanged) acc[dir].contentChanged++;
      if (result.status.nameChanged) acc[dir].nameChanged++;
      if (!result.status.contentChanged && !result.status.nameChanged) acc[dir].unchanged++;
      
      return acc;
    }, {});
  }

  static report(results, options) {
    const successful = results.filter(r => r.success);
    const contentChanged = successful.filter(r => r.status?.contentChanged);
    const nameChanged = successful.filter(r => r.status?.nameChanged);
    const unchanged = successful.filter(r => r.success && !r.status?.contentChanged && !r.status?.nameChanged);
    const failed = results.filter(r => !r.success);

    console.log('\nProcessing complete:');
    console.log(`✓ Successfully processed ${successful.length} files:`);
    
    if (options.recursive) {
      const groupedResults = this.groupResultsByDirectory(results);
      
      for (const [dir, stats] of Object.entries(groupedResults)) {
        console.log(`\nDirectory: ${dir}`);
        if (options.contentPrompt && stats.contentChanged > 0) {
          console.log(`  - ${stats.contentChanged} files had content changed`);
        }
        if (options.filenamePrompt && stats.nameChanged > 0) {
          console.log(`  - ${stats.nameChanged} files were renamed`);
        }
        console.log(`  - ${stats.unchanged} files unchanged`);
      }
    } else {
      if (options.contentPrompt) {
        console.log(`  - ${contentChanged.length} files had content changed`);
      }
      if (options.filenamePrompt) {
        console.log(`  - ${nameChanged.length} files were renamed`);
      }
      console.log(`  - ${unchanged.length} files unchanged`);
    }
    
    if (nameChanged.length > 0) {
      console.log('\nRenamed files:');
      nameChanged.forEach(result => {
        console.log(`  ${path.basename(result.originalPath)} -> ${path.basename(result.newPath)}`);
      });
    }
    
    if (failed.length > 0) {
      console.log(`\n✗ Failed to process ${failed.length} files:`);
      failed.forEach(result => {
        console.log(`  - ${path.basename(result.filepath)}: ${result.error}`);
      });
    }

    if (options.backup) {
      console.log(`\nBackups created in ${CONFIG.BACKUP_DIR}/`);
    }
  }
}

export default ResultReporter;
