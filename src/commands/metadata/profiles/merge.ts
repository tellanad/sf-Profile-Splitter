import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('sf-profiles-splitter', 'merge');

export default class Merge extends SfCommand<void> {
  public static summary = messages.getMessage('summary');
  public static description = messages.getMessage('description');
  
  public static examples = [
    '$ sf metadata profiles merge -i force-app/main/default/profiles-split -o force-app/main/default/profiles'
  ];

  public static flags = {
    input: Flags.directory({
      char: 'i',
      summary: messages.getMessage('flags.input.summary'),
      description: messages.getMessage('flags.input.description'),
      default: 'force-app/main/default/profiles',
      required: true
    }),
    output: Flags.directory({
      char: 'o',
      summary: messages.getMessage('flags.output.summary'),
      description: messages.getMessage('flags.output.description'),
      default: 'force-app/main/default/profiles',
      required: true
    }),
    delete: Flags.boolean({
      char: 'd',
      summary: messages.getMessage('flags.delete.summary'),
      description: messages.getMessage('flags.delete.description'),
      default: false
    })
  };

  // For backward compatibility during transition
  public static deprecateAliases = true;
  // This allows the old command format to still work
  public static aliases = ['metadata:profiles:merge'];

  public async run(): Promise<void> {
    const { flags } = await this.parse(Merge);
    
    const inputDir = flags.input;
    const outputDir = flags.output;
    const shouldDelete = flags.delete;

    this.log(`Merging profiles from ${inputDir} to ${outputDir}`);
    
    // Check if the input directory exists
    if (!fs.existsSync(inputDir)) {
      throw new Error(`Input directory ${inputDir} does not exist`);
    }

    // Create the output directory if it does not exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get all profile directories in the input directory
    const profileDirs = fs.readdirSync(inputDir)
      .filter(item => fs.statSync(path.join(inputDir, item)).isDirectory())
      .map(dir => path.join(inputDir, dir));

    if (profileDirs.length === 0) {
      this.log('No profile directories found in the input directory');
      return;
    }

    this.log(`Found ${profileDirs.length} profile directories`);

    // Process each profile directory
    for (const profileDir of profileDirs) {
      await this.mergeProfile(profileDir, outputDir);
    }

    // Delete the original directories if requested
    if (shouldDelete) {
      for (const profileDir of profileDirs) {
        this.deleteDirectory(profileDir);
        this.log(`Deleted original directory: ${profileDir}`);
      }
    }

    this.log('Profile merging completed successfully');
  }

  private async mergeProfile(profileDir: string, outputDir: string): Promise<void> {
    const profileName = path.basename(profileDir);
    this.log(`Processing profile: ${profileName}`);

    // Create a new profile object
    const profile: any = {
      _xmlns: 'http://soap.sforce.com/2006/04/metadata'
    };

    // Get all subdirectories (categories) in the profile directory
    const categoryDirs = fs.readdirSync(profileDir)
      .filter(item => fs.statSync(path.join(profileDir, item)).isDirectory())
      .map(dir => path.join(profileDir, dir));

    for (const categoryDir of categoryDirs) {
      const categoryName = path.basename(categoryDir);
      this.log(`  Processing category: ${categoryName}`);

      // Get all XML files in this category
      const itemFiles = fs.readdirSync(categoryDir)
        .filter(file => file.endsWith('.xml'))
        .map(file => path.join(categoryDir, file));

      if (itemFiles.length === 0) {
        continue;
      }

      // Process each item file
      for (const itemFile of itemFiles) {
        try {
          const itemContent = fs.readFileSync(itemFile, 'utf-8');
          const parser = new xml2js.Parser();
          const result = await parser.parseStringPromise(itemContent);

          // Extract the profile data
          if (result.Profile && result.Profile[categoryName]) {
            const items = result.Profile[categoryName];
            if (Array.isArray(items) && items.length > 0) {
              // Initialize the category array if it doesn't exist
              if (!profile[categoryName]) {
                profile[categoryName] = [];
              }
              
              // Add the items to the profile
              profile[categoryName].push(...items);
            }
          }
        } catch (error) {
          this.error(`Error processing item file ${itemFile}: ${error.message}`);
        }
      }
    }

    // Create the full profile XML
    const builder = new xml2js.Builder();
    const profileXml = builder.buildObject({ Profile: profile });

    // Write the profile to a file
    const outputFile = path.join(outputDir, `${profileName}.profile-meta.xml`);
    fs.writeFileSync(outputFile, profileXml);
    this.log(`Created merged profile: ${outputFile}`);
  }

  private deleteDirectory(directory: string): void {
    if (fs.existsSync(directory)) {
      fs.readdirSync(directory).forEach(file => {
        const currentPath = path.join(directory, file);
        if (fs.statSync(currentPath).isDirectory()) {
          this.deleteDirectory(currentPath);
        } else {
          fs.unlinkSync(currentPath);
        }
      });
      fs.rmdirSync(directory);
    }
  }
}
