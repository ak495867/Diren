import { SemanticScorer, SemanticVector } from '../intelligence/SemanticScorer';
import { generateCodeVariations, generateAnalysisVariations } from './setup';

describe('SemanticScorer', () => {
  let scorer: SemanticScorer;

  beforeEach(() => {
    scorer = SemanticScorer.getInstance();
  });

  describe('extractSemanticVector', () => {
    it('should extract semantic vectors from text', () => {
      const text = 'Write a Python function to sort arrays';
      const vector = scorer.extractSemanticVector(text);

      expect(vector.tokens).toContain('write');
      expect(vector.tokens).toContain('python');
      expect(vector.tokens).toContain('function');
      expect(vector.tokens).toContain('sort');
      expect(vector.tokens).toContain('arrays');
      
      expect(vector.intent).toBe('generate');
      expect(vector.entities).toEqual(expect.arrayContaining(['lang:python']));
      expect(vector.keywords).toEqual(expect.arrayContaining(['python', 'function']));
      expect(vector.complexity).toBeGreaterThan(0);
      expect(vector.embeddings).toHaveLength(100);
    });

    it('should detect different intents correctly', () => {
      const testCases = [
        { text: 'Explain how machine learning works', intent: 'explain' },
        { text: 'How to implement a neural network', intent: 'howto' },
        { text: 'Fix this JavaScript error', intent: 'debug' },
        { text: 'Create a REST API endpoint', intent: 'generate' },
        { text: 'Review this code for bugs', intent: 'analyze' },
        { text: 'Convert this Python to JavaScript', intent: 'transform' }
      ];

      testCases.forEach(({ text, intent }) => {
        const vector = scorer.extractSemanticVector(text);
        expect(vector.intent).toBe(intent);
      });
    });

    it('should extract programming language entities', () => {
      const testCases = [
        { text: 'JavaScript array methods', entities: ['lang:javascript'] },
        { text: 'Python data structures', entities: ['lang:python'] },
        { text: 'Java Spring Boot tutorial', entities: ['lang:java'] },
        { text: 'C++ memory management', entities: ['lang:cpp'] }
      ];

      testCases.forEach(({ text, entities }) => {
        const vector = scorer.extractSemanticVector(text);
        entities.forEach(entity => {
          expect(vector.entities).toContain(entity);
        });
      });
    });

    it('should extract framework entities', () => {
      const testCases = [
        { text: 'React component lifecycle', entities: ['framework:react'] },
        { text: 'Vue.js state management', entities: ['framework:vue'] },
        { text: 'Express middleware setup', entities: ['framework:express'] },
        { text: 'Django REST framework', entities: ['framework:django'] }
      ];

      testCases.forEach(({ text, entities }) => {
        const vector = scorer.extractSemanticVector(text);
        entities.forEach(entity => {
          expect(vector.entities).toContain(entity);
        });
      });
    });
  });

  describe('calculateSimilarity', () => {
    it('should return high similarity for identical text', () => {
      const text = 'Write a Python function to sort arrays';
      const vector1 = scorer.extractSemanticVector(text);
      const vector2 = scorer.extractSemanticVector(text);

      const score = scorer.calculateSimilarity(vector1, vector2);

      expect(score.similarity).toBeCloseTo(1.0, 1);
      expect(score.confidence).toBeGreaterThan(0.9);
      expect(score.matchType).toBe('exact');
    });

    it('should return high similarity for semantically similar text', () => {
      const variations = generateCodeVariations();
      const baseVector = scorer.extractSemanticVector(variations[0]);

      for (let i = 1; i < variations.length; i++) {
        const testVector = scorer.extractSemanticVector(variations[i]);
        const score = scorer.calculateSimilarity(baseVector, testVector);

        expect(score.similarity).toBeGreaterThan(0.7);
        expect(score.matchType).toBeOneOf(['exact', 'semantic', 'contextual']);
        expect(score.features).toEqual(expect.arrayContaining(['intent:generate']));
      }
    });

    it('should return lower similarity for different topics', () => {
      const codeVector = scorer.extractSemanticVector('Write a Python function');
      const analysisVector = scorer.extractSemanticVector('Analyze market trends');

      const score = scorer.calculateSimilarity(codeVector, analysisVector);

      expect(score.similarity).toBeLessThan(0.5);
      expect(score.matchType).toBe('intent');
    });

    it('should identify matching features', () => {
      const vector1 = scorer.extractSemanticVector('Debug this JavaScript function');
      const vector2 = scorer.extractSemanticVector('Fix JavaScript code error');

      const score = scorer.calculateSimilarity(vector1, vector2);

      expect(score.features).toEqual(expect.arrayContaining([
        'intent:debug',
        expect.stringContaining('lang:javascript')
      ]));
    });

    it('should handle sentiment matching', () => {
      const positive1 = scorer.extractSemanticVector('This is a great solution');
      const positive2 = scorer.extractSemanticVector('Excellent approach to the problem');
      const negative = scorer.extractSemanticVector('This is a terrible implementation');

      const positiveScore = scorer.calculateSimilarity(positive1, positive2);
      const mixedScore = scorer.calculateSimilarity(positive1, negative);

      expect(positiveScore.features).toEqual(expect.arrayContaining(['sentiment:positive']));
      expect(mixedScore.features).not.toEqual(expect.arrayContaining(['sentiment:positive']));
    });
  });

  describe('vocabulary learning', () => {
    it('should update vocabulary with new terms', () => {
      const initialVocabSize = scorer['vocabMap'].size;
      
      scorer.updateVocabulary('blockchain cryptocurrency decentralized');
      
      const newVocabSize = scorer['vocabMap'].size;
      expect(newVocabSize).toBeGreaterThan(initialVocabSize);
    });

    it('should update IDF scores', () => {
      const term = 'specializedterm';
      scorer.updateVocabulary(`Text with ${term}`);
      
      expect(scorer['idfScores'].has(term)).toBe(true);
      expect(scorer['documentFrequency'].has(term)).toBe(true);
    });
  });

  describe('complexity calculation', () => {
    it('should assign higher complexity to technical content', () => {
      const simple = scorer.extractSemanticVector('Hello world');
      const complex = scorer.extractSemanticVector(`
        Implement a distributed consensus algorithm using the Raft protocol,
        ensuring fault tolerance and partition resilience. The implementation
        should handle leader election, log replication, and safety properties.
        \`\`\`python
        class RaftNode:
            def __init__(self, node_id):
                self.node_id = node_id
        \`\`\`
      `);

      expect(complex.complexity).toBeGreaterThan(simple.complexity);
      expect(complex.complexity).toBeGreaterThan(0.5);
    });

    it('should consider code blocks in complexity', () => {
      const withCode = scorer.extractSemanticVector(`
        Here's a Python function:
        \`\`\`python
        def quicksort(arr):
            if len(arr) <= 1:
                return arr
            pivot = arr[len(arr) // 2]
            left = [x for x in arr if x < pivot]
            middle = [x for x in arr if x == pivot]
            right = [x for x in arr if x > pivot]
            return quicksort(left) + middle + quicksort(right)
        \`\`\`
      `);

      const withoutCode = scorer.extractSemanticVector('Here is a simple explanation');

      expect(withCode.complexity).toBeGreaterThan(withoutCode.complexity);
    });
  });

  describe('performance', () => {
    it('should extract vectors quickly', () => {
      const text = 'Create a machine learning model for image classification';
      
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        scorer.extractSemanticVector(text);
      }
      const end = Date.now();
      
      const avgTime = (end - start) / 100;
      expect(avgTime).toBeLessThan(50); // Less than 50ms per extraction
    });

    it('should calculate similarity quickly', () => {
      const vector1 = scorer.extractSemanticVector('Test text one');
      const vector2 = scorer.extractSemanticVector('Test text two');
      
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        scorer.calculateSimilarity(vector1, vector2);
      }
      const end = Date.now();
      
      const avgTime = (end - start) / 100;
      expect(avgTime).toBeLessThan(10); // Less than 10ms per similarity calculation
    });
  });
});